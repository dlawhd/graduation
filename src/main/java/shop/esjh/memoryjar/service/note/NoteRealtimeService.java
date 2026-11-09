package shop.esjh.memoryjar.service.note;

import shop.esjh.memoryjar.service.BestEffortDelivery;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import shop.esjh.memoryjar.dto.note.response.NoteRealtimeEventResponse;

/*
 * NoteRealtimeService 역할
 *
 * 쪽지의 댓글·답글·리액션이 바뀌면
 * 같은 저금통을 보고 있는 사용자들에게 WebSocket 이벤트를 보내는 서비스다.
 *
 * 쉽게 말하면:
 * - 예전에는 특정 쪽지 상세 주소에만 소식을 보냈고
 * - 이제는 저금통 전체 쪽지 주소에도 소식을 보내서
 * - 쪽지 목록 화면도 실시간으로 갱신할 수 있게 한다.
 */
@Service
public class NoteRealtimeService {

    // WebSocket 구독자들에게 메시지를 보내는 도구
    private final SimpMessagingTemplate messagingTemplate;
    private final shop.esjh.memoryjar.service.jar.JarOpenService jarOpenService;

    public NoteRealtimeService(
            SimpMessagingTemplate messagingTemplate,
            shop.esjh.memoryjar.service.jar.JarOpenService jarOpenService
    ) {
        this.messagingTemplate = messagingTemplate;
        this.jarOpenService = jarOpenService;
    }

    /*
     * DB 커밋이 성공한 뒤에만 WebSocket 이벤트를 보낸다.
     *
     * DB 저장이 실패했는데 화면만 먼저 바뀌는 일을 막기 위해
     * 실제 커밋이 끝난 다음 이벤트를 전달한다.
     */
    public void sendNoteEventAfterCommit(
            Long jarId,
            Long noteId,
            NoteRealtimeEventResponse event
    ) {
        if (jarId == null || noteId == null || event == null) {
            return;
        }
        // 본인이 닫힌 쪽지에 댓글을 남겨도 쪽지 번호·작성자·댓글 수를 다른 멤버에게 보내지 않는다.
        // 발행기는 오픈을 실행하지 않는다. 실제 오픈 기록이 커밋된 이후만 공통 채널에 전달한다.
        if (!jarOpenService.isOpened(jarId)) return;

        /*
         * 새 프론트가 구독할 저금통 전체 쪽지 주소다.
         *
         * 예:
         * /topic/jars/10/notes
         *
         * 실제로 어느 쪽지가 바뀌었는지는
         * event.noteId 값으로 구분한다.
         */
        String jarNotesDestination =
                "/topic/jars/" + jarId + "/notes";

        /*
         * 기존 프론트가 구독하던 쪽지 상세 주소다.
         *
         * 배포 직후 아직 예전 화면을 열고 있는 사용자도
         * 실시간 기능이 끊기지 않도록 당분간 함께 전송한다.
         *
         * 새 프론트에서는 이 주소를 구독하지 않기 때문에
         * 화면에서 이벤트가 두 번 처리되지는 않는다.
         */
        String legacyNoteDetailDestination =
                "/topic/jars/" + jarId + "/notes/" + noteId;

        Runnable sendTask = () -> {
            // 새 저금통 전체 쪽지 주소로 전송
            BestEffortDelivery.send("NOTE", () -> messagingTemplate.convertAndSend(
                    jarNotesDestination,
                    event
            ));

            // 기존 쪽지 상세 주소로도 전송
            BestEffortDelivery.send("NOTE", () -> messagingTemplate.convertAndSend(
                    legacyNoteDetailDestination,
                    event
            ));
        };

        /*
         * 현재 트랜잭션이 동작 중이면
         * DB 커밋이 성공한 뒤 WebSocket 이벤트를 보낸다.
         */
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            sendTask.run();
                        }
                    }
            );

            return;
        }

        // 트랜잭션 밖에서 호출됐다면 바로 전송한다.
        sendTask.run();
    }
}
