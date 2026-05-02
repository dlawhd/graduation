package com.example.demo.service.jar;

import com.example.demo.dto.jar.response.JarMemberSocketEventResponse;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/*
 * JarMemberRealtimeService 역할
 *
 * 이 서비스는 "저금통 멤버 변화 이벤트"를 WebSocket으로 보내는 역할을 한다.
 *
 * 쉽게 말하면:
 * - 누가 들어오거나
 * - 누가 나가거나
 * - 누가 강퇴되거나
 * - 역할이 바뀌면
 *
 * /topic/jars/{jarId}/members 주소로 실시간 알림을 보내준다.
 */
@Service
public class JarMemberRealtimeService {

    // WebSocket 구독자들에게 메시지를 보내는 도구
    private final SimpMessagingTemplate messagingTemplate;

    public JarMemberRealtimeService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /*
     * DB 커밋이 성공한 뒤에만 WebSocket 이벤트를 보낸다.
     *
     * 왜 이렇게 하냐면?
     * - DB 변경은 실패했는데 프론트 화면만 바뀌면 이상해진다.
     * - 그래서 "DB 저장 성공!"이 확정된 뒤에만 실시간 이벤트를 보낸다.
     */
    public void sendMemberEventAfterCommit(Long jarId, JarMemberSocketEventResponse event) {
        if (jarId == null || event == null) {
            return;
        }

        Runnable sendTask = () -> messagingTemplate.convertAndSend(
                "/topic/jars/" + jarId + "/members",
                event
        );

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    sendTask.run();
                }
            });
            return;
        }

        sendTask.run();
    }
}