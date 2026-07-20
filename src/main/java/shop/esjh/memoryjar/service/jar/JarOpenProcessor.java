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

/*
 * JarOpenProcessor 역할
 *
 * 이 서비스는 저금통 한 개를 실제로 여는 작업만 담당한다.
 *
 * 저금통 한 개를 열 때 필요한 작업:
 * 1. 이미 열린 저금통인지 확인한다.
 * 2. 저금통 row를 잠금 조회한다.
 * 3. jar_open_events에 오픈 기록을 저장한다.
 * 4. 커밋 후 전송할 WebSocket 이벤트를 등록한다.
 * 5. 채팅방에 SYSTEM 메시지를 저장한다.
 *
 * 핵심:
 * - openIfDue()는 REQUIRES_NEW 트랜잭션으로 실행된다.
 * - 한 저금통 처리에 실패해도 다른 저금통 트랜잭션에는 영향을 주지 않는다.
 */
@Service
public class JarOpenProcessor {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final JarRepository jarRepository;
    private final JarOpenEventRepository jarOpenEventRepository;
    private final JarOpenRealtimeService jarOpenRealtimeService;
    private final ChatSystemMessageService chatSystemMessageService;

    public JarOpenProcessor(
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

    /*
     * 저금통 한 개를 독립된 새 트랜잭션에서 연다.
     *
     * REQUIRES_NEW 동작:
     * - 바깥에 트랜잭션이 있다면 잠시 멈춘다.
     * - 이 메서드만을 위한 새로운 트랜잭션을 만든다.
     * - 이 저금통 작업이 끝나면 바로 커밋하거나 롤백한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean openIfDue(Long jarId, JarOpenReason reason) {

        // 1. 이미 열림 기록이 있으면 다시 만들지 않는다.
        // 이미 열린 상태이므로 true를 반환한다.
        if (jarOpenEventRepository.existsByJar_JarId(jarId)) {
            return true;
        }

        // 2. 저금통 row를 비관적 쓰기 잠금으로 조회한다.
        // 동시에 여러 요청이 와도 오픈 기록이 중복 생성되지 않게 한다.
        Jar jar = jarRepository.findByJarIdForUpdate(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 3. 잠금을 얻은 뒤 다시 확인한다.
        // 잠금을 기다리는 동안 다른 요청이 먼저 열었을 수 있기 때문이다.
        if (jarOpenEventRepository.existsByJar_JarId(jarId)) {
            return true;
        }

        // 4. 아직 약속한 오픈 시간이 지나지 않았다면 열지 않는다.
        LocalDateTime now = LocalDateTime.now(KST);

        if (jar.getOpenAt().isAfter(now)) {
            return false;
        }

        // 5. 실제 오픈 기록을 만든다.
        // openedAt은 처리한 현재 시간이 아니라 원래 약속한 openAt을 저장한다.
        JarOpenEvent event = JarOpenEvent.create(
                jar,
                jar.getOpenAt(),
                reason
        );

        jarOpenEventRepository.save(event);

        // 6. 저금통 상세 화면으로 보낼 WebSocket 이벤트를 만든다.
        JarOpenSocketEventResponse socketEvent =
                JarOpenSocketEventResponse.jarOpened(
                        jar.getJarId(),
                        toKstOffsetDateTime(event.getOpenedAt())
                );

        // 7. 현재 저금통 트랜잭션이 커밋된 뒤에만
        // 저금통 오픈 WebSocket 이벤트를 전송한다.
        jarOpenRealtimeService.sendJarOpenedEventAfterCommit(
                jar.getJarId(),
                socketEvent
        );

        // 8. 같은 트랜잭션 안에서 채팅 SYSTEM 메시지를 저장한다.
        // 여기서 실패하면 이 저금통의 오픈 기록도 함께 롤백된다.
        chatSystemMessageService.createAndSendJarOpenedMessage(jar);

        return true;
    }

    /*
     * DB의 LocalDateTime을
     * 프론트 응답용 OffsetDateTime(+09:00)으로 바꾼다.
     */
    private OffsetDateTime toKstOffsetDateTime(
            LocalDateTime localDateTime
    ) {
        if (localDateTime == null) {
            return null;
        }

        return localDateTime
                .atZone(KST)
                .toOffsetDateTime();
    }
}