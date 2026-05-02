package com.example.demo.service.note;

import com.example.demo.dto.note.response.NoteRealtimeEventResponse;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

// 쪽지 상세 화면의 변화"를 WebSocket으로 보내는 역할
@Service
public class NoteRealtimeService {

    // WebSocket 구독자들에게 메시지를 보내는 도구
    private final SimpMessagingTemplate messagingTemplate;

    public NoteRealtimeService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /*
     * DB 커밋이 성공한 뒤에만 WebSocket 이벤트를 보낸다.
     *
     * 왜 afterCommit을 쓰냐면?
     * - DB 저장은 실패했는데 화면만 바뀌면 이상해진다.
     * - 그래서 "DB에 진짜 저장 성공!"이 확정된 다음에만 프론트에게 알려준다.
     */
    public void sendNoteEventAfterCommit(
            Long jarId,
            Long noteId,
            NoteRealtimeEventResponse event
    ) {
        if (jarId == null || noteId == null || event == null) {
            return;
        }

        Runnable sendTask = () -> messagingTemplate.convertAndSend(
                "/topic/jars/" + jarId + "/notes/" + noteId,
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