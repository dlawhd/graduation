package shop.esjh.memoryjar.service.jar;

import shop.esjh.memoryjar.dto.dailydraw.response.DailyDrawSocketEventResponse;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/*
 * JarDailyDrawRealtimeService 역할
 *
 * 이 서비스는 "오늘의 추억 한 장이 뽑혔어!"라는 소식을
 * 같은 저금통 상세 화면을 보고 있는 멤버들에게 WebSocket으로 알려주는 역할을 한다.
 *
 * 쉽게 말하면:
 * - A 사용자가 오늘의 추억 한 장을 뽑으면
 * - B, C 같은 다른 멤버 화면도 새로고침 없이 알 수 있게
 * - /topic/jars/{jarId}/daily-draw 주소로 이벤트를 보내준다.
 *
 * 왜 afterCommit을 쓰냐면?
 * - DB에는 오늘 카드 저장이 실패했는데
 * - 프론트 화면에만 "오늘 카드가 뽑혔어요!"가 뜨면 이상하기 때문이다.
 *
 * 그래서 항상:
 * 1. DB에 Daily Draw 저장 성공
 * 2. 트랜잭션 커밋 성공
 * 3. WebSocket 이벤트 전송
 * 순서로 움직이게 한다.
 */
@Service
public class JarDailyDrawRealtimeService {

    // WebSocket을 구독 중인 프론트에게 메시지를 보내는 도구
    private final SimpMessagingTemplate messagingTemplate;

    public JarDailyDrawRealtimeService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /*
     * Daily Draw 공개 이벤트를 DB 커밋 성공 후에 보낸다.
     *
     * jarId:
     * - 몇 번 저금통 채널로 보낼지 정하는 값
     *
     * event:
     * - 프론트가 받을 DAILY_DRAW_REVEALED 이벤트 데이터
     */
    public void sendDailyDrawEventAfterCommit(
            Long jarId,
            DailyDrawSocketEventResponse event
    ) {
        // jarId나 event가 없으면 보낼 수 있는 정보가 없으므로 조용히 종료한다.
        if (jarId == null || event == null) {
            return;
        }

        // 프론트가 구독할 주소
        // 예: /topic/jars/10/daily-draw
        String destination = "/topic/jars/" + jarId + "/daily-draw";

        // 실제로 WebSocket 메시지를 보내는 작업
        Runnable sendTask = () -> messagingTemplate.convertAndSend(destination, event);

        // 현재 DB 트랜잭션이 살아 있으면, 커밋이 성공한 뒤에만 이벤트를 보낸다.
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

        // 혹시 트랜잭션 밖에서 호출되면 바로 보낸다.
        sendTask.run();
    }
}