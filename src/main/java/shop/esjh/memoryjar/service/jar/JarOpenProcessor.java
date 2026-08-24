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
 * 1. 저금통 row를 먼저 비관적 잠금으로 조회한다.
 * 2. 잠금을 얻은 뒤 이미 열린 저금통인지 확인한다.
 * 3. 아직 오픈 시간이 되지 않았다면 종료한다.
 * 4. jar_open_events에 오픈 기록을 저장한다.
 * 5. 커밋 후 전송할 WebSocket 이벤트를 등록한다.
 * 6. 채팅방에 SYSTEM 메시지를 저장한다.
 *
 * 왜 잠금을 먼저 잡을까?
 * - 스케줄러와 사용자 조회가 동시에 같은 저금통을 열려고 할 수 있다.
 * - 먼저 저금통 row를 잠그면 한 요청씩 순서대로 오픈 여부를 확인할 수 있다.
 * - 같은 jar_id의 오픈 이벤트가 중복 INSERT되는 경쟁 상태를 막을 수 있다.
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

        /*
         * 1. 가장 먼저 저금통 row를 비관적 쓰기 잠금으로 조회한다.
         *
         * 쉽게 말하면:
         * 같은 저금통을 동시에 두 요청이 열려고 할 때
         * 먼저 도착한 요청 하나만 이 저금통을 사용할 수 있도록
         * DB에서 잠깐 "자물쇠"를 거는 것이다.
         *
         * 예:
         * 스케줄러 → 84번 저금통 오픈 시도
         * 사용자 조회 → 84번 저금통 오픈 시도
         *
         * 둘이 동시에 와도 한 요청이 먼저 끝난 다음
         * 다른 요청이 이어서 처리된다.
         */
        Jar jar = jarRepository.findByJarIdForUpdate(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        /*
         * 2. 잠금을 얻은 다음 오픈 기록을 확인한다.
         *
         * 이 순서가 중요하다.
         *
         * 기존에는 잠금을 잡기 전에 exists 조회를 먼저 했기 때문에
         * 동시에 실행된 다른 트랜잭션의 오픈 결과를 제대로 확인하지 못하고
         * 같은 jar_id로 INSERT를 다시 시도할 가능성이 있었다.
         *
         * 이제는:
         *
         * LOCK
         *   ↓
         * 이미 열렸는지 확인
         *   ↓
         * 안 열렸을 때만 INSERT
         *
         * 순서로 처리한다.
         */
        if (jarOpenEventRepository.existsByJar_JarId(jarId)) {
            return true;
        }

        /*
         * 3. 아직 약속한 오픈 시간이 지나지 않았다면 열지 않는다.
         *
         * 예:
         * 현재 시간이 8월 24일인데
         * openAt이 8월 30일이면 아직 열면 안 된다.
         */
        LocalDateTime now = LocalDateTime.now(KST);

        if (jar.getOpenAt().isAfter(now)) {
            return false;
        }

        /*
         * 4. 실제 저금통 오픈 기록을 만든다.
         *
         * openedAt에는 지금 처리한 시간이 아니라
         * 원래 저금통에 약속되어 있던 openAt을 기록한다.
         */
        JarOpenEvent event = JarOpenEvent.create(
                jar,
                jar.getOpenAt(),
                reason
        );

        /*
         * DB의 jar_open_events 테이블에 저장한다.
         *
         * jar_id에는 UNIQUE 제약조건이 있으므로
         * 같은 저금통의 오픈 기록은 하나만 존재할 수 있다.
         *
         * UNIQUE는 삭제하지 않는다.
         * 애플리케이션에서 실수하더라도 DB가 한 번 더 막아주는
         * 마지막 안전장치이기 때문이다.
         */
        jarOpenEventRepository.save(event);

        /*
         * 5. 프론트에 전달할
         * "저금통이 열렸어요" WebSocket 이벤트를 만든다.
         */
        JarOpenSocketEventResponse socketEvent =
                JarOpenSocketEventResponse.jarOpened(
                        jar.getJarId(),
                        toKstOffsetDateTime(event.getOpenedAt())
                );

        /*
         * 6. DB 트랜잭션이 실제로 커밋된 뒤
         * WebSocket 이벤트를 전송하도록 등록한다.
         *
         * DB 저장은 실패했는데
         * 화면에만 "저금통이 열렸어요"가 뜨는 일을 막는다.
         */
        jarOpenRealtimeService.sendJarOpenedEventAfterCommit(
                jar.getJarId(),
                socketEvent
        );

        /*
         * 7. 저금통 채팅방에도
         * "저금통이 열렸어요" SYSTEM 메시지를 저장한다.
         *
         * 같은 트랜잭션 안에서 실행되므로
         * 이 작업이 실패하면 오픈 기록도 함께 롤백된다.
         */
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