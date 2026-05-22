package shop.esjh.memoryjar.service.jar;

import shop.esjh.memoryjar.dto.jar.response.JarOpenSocketEventResponse;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.jar.JarOpenEvent;
import shop.esjh.memoryjar.enums.jar.JarOpenReason;
import shop.esjh.memoryjar.repository.jar.JarOpenEventRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import shop.esjh.memoryjar.service.chat.ChatSystemMessageService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;

/*
 * JarOpenService 역할
 *
 * 이 서비스는 저금통이 열릴 시간이 됐는지 확인하고,
 * 실제로 열렸다면 jar_open_events 테이블에 "열림 기록"을 남기는 역할을 한다.
 */
@Service
public class JarOpenService {

    private final JarRepository jarRepository;
    private final JarOpenEventRepository jarOpenEventRepository;
    private final JarOpenRealtimeService jarOpenRealtimeService;
    private final ChatSystemMessageService chatSystemMessageService;

    public JarOpenService(
            JarRepository jarRepository,
            JarOpenEventRepository jarOpenEventRepository,
            JarOpenRealtimeService jarOpenRealtimeService,
            ChatSystemMessageService chatSystemMessageService
    ) {
        this.jarRepository = jarRepository;
        this.jarOpenEventRepository = jarOpenEventRepository;
        this.jarOpenRealtimeService = jarOpenRealtimeService;
        this.chatSystemMessageService = chatSystemMessageService;
    }

    // 이미 열렸는지 "jar_open_events 기록" 기준으로 확인한다.
    @Transactional(readOnly = true)
    public boolean isOpened(Long jarId) {
        return jarOpenEventRepository.existsByJar_JarId(jarId);
    }

    /*
     * 사용자가 저금통을 조회했을 때 호출된다.
     *
     * 예:
     * - 스케줄러가 아직 못 열었는데
     * - 사용자가 오픈 시간 이후에 상세 화면에 들어옴
     *
     * 이 경우에도 바로 열림 기록을 남겨서 화면이 열린 상태로 보이게 한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean ensureOpenedIfDue(Long jarId) {
        return openIfDue(jarId, JarOpenReason.ACCESS_TRIGGERED);
    }

    /*
     * 스케줄러가 1분마다 호출한다.
     *
     * openAt이 지난 저금통을 찾아서 미리 열어준다.
     */
    @Transactional
    public int openDueJars() {
        List<Jar> dueJars = jarRepository.findDueJarsWithoutOpenEvent(LocalDateTime.now());

        int openedCount = 0;

        for (Jar jar : dueJars) {
            if (openIfDue(jar.getJarId(), JarOpenReason.SCHEDULED)) {
                openedCount++;
            }
        }

        return openedCount;
    }

    /*
     * 실제로 저금통을 여는 공통 메서드
     *
     * 이 메서드는 두 곳에서 사용된다.
     * 1. 사용자가 조회했을 때 ensureOpenedIfDue()
     * 2. 스케줄러가 돌 때 openDueJars()
     */
    private boolean openIfDue(Long jarId, JarOpenReason reason) {

        // 1. 이미 열림 기록이 있으면 다시 열지 않는다.
        // 이미 열린 상태이므로 true를 반환한다.
        if (jarOpenEventRepository.existsByJar_JarId(jarId)) {
            return true;
        }

        // 2. 저금통 row를 잠금 조회한다.
        // 동시에 여러 요청이 와도 오픈 기록이 중복으로 생기지 않게 막기 위해서다.
        Jar jar = jarRepository.findByJarIdForUpdate(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 3. 잠금을 잡은 뒤 한 번 더 확인한다.
        // 거의 동시에 들어온 다른 요청이 이미 열었을 수도 있기 때문이다.
        if (jarOpenEventRepository.existsByJar_JarId(jarId)) {
            return true;
        }

        // 4. 아직 오픈 시간이 안 됐으면 열지 않는다.
        if (jar.getOpenAt().isAfter(LocalDateTime.now())) {
            return false;
        }

        // 5. 오픈 기록을 저장한다.
        // openedAt은 실제 처리 시간이 아니라 원래 약속한 openAt으로 남긴다.
        JarOpenEvent event = JarOpenEvent.create(
                jar,
                jar.getOpenAt(),
                reason
        );

        jarOpenEventRepository.save(event);

        // 6. 프론트가 받을 WebSocket 이벤트를 만든다.
        JarOpenSocketEventResponse socketEvent = JarOpenSocketEventResponse.jarOpened(
                jar.getJarId(),
                toKstOffsetDateTime(event.getOpenedAt())
        );

        // 7. 저금통 상세 화면 구독자들에게 "저금통 열렸어!" 이벤트를 보낸다.
        jarOpenRealtimeService.sendJarOpenedEventAfterCommit(
                jar.getJarId(),
                socketEvent
        );

        // 8. 채팅방에도 SYSTEM 메시지를 남긴다.
        // 기존 채팅 구독 주소 /topic/jars/{jarId}/chat 으로도 실시간 전송된다.
        chatSystemMessageService.createAndSendJarOpenedMessage(jar);

        return true;
    }

    /*
     * DB에 저장된 LocalDateTime을 프론트 응답용 OffsetDateTime(+09:00)으로 바꿔준다.
     *
     * DB 값은 한국 시간 벽시계값이라고 보고,
     * 화면에는 +09:00 정보가 붙은 시간으로 내려준다.
     */
    private OffsetDateTime toKstOffsetDateTime(LocalDateTime localDateTime) {
        if (localDateTime == null) {
            return null;
        }

        return localDateTime
                .atZone(ZoneId.of("Asia/Seoul"))
                .toOffsetDateTime();
    }
}