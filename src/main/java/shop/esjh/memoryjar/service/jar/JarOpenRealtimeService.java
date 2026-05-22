package shop.esjh.memoryjar.service.jar;

import shop.esjh.memoryjar.dto.jar.response.JarOpenSocketEventResponse;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/*
 * JarOpenRealtimeService 역할
 *
 * 이 서비스는 "저금통이 열렸어!"라는 소식을
 * 저금통 상세 화면을 보고 있는 멤버들에게 WebSocket으로 보내는 역할을 한다.
 *
 * 보내는 주소:
 * /topic/jars/{jarId}/open
 *
 * 왜 afterCommit을 쓰냐면?
 * - DB에 jar_open_events 기록 저장이 실패했는데
 * - 화면에만 "열렸어요"가 뜨면 이상하기 때문이다.
 *
 * 그래서 항상:
 * 1. DB 오픈 기록 저장 성공
 * 2. 트랜잭션 커밋 성공
 * 3. WebSocket 전송
 * 순서로 움직이게 한다.
 */
@Service
public class JarOpenRealtimeService {

    // WebSocket 구독자들에게 메시지를 보내는 도구
    private final SimpMessagingTemplate messagingTemplate;

    public JarOpenRealtimeService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /*
     * 저금통 오픈 이벤트를 커밋 이후에 전송한다.
     *
     * jarId:
     * - 몇 번 저금통에 보낼지 정하는 값
     *
     * event:
     * - 프론트가 받을 JAR_OPENED 이벤트 데이터
     */
    public void sendJarOpenedEventAfterCommit(
            Long jarId,
            JarOpenSocketEventResponse event
    ) {
        // 프론트가 구독할 주소
        String destination = "/topic/jars/" + jarId + "/open";

        // 현재 트랜잭션이 살아 있으면 DB 커밋 성공 후에 보낸다.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            messagingTemplate.convertAndSend(destination, event);
                        }
                    }
            );
            return;
        }

        // 혹시 트랜잭션 밖에서 호출되면 바로 보낸다.
        messagingTemplate.convertAndSend(destination, event);
    }
}