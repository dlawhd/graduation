package shop.esjh.memoryjar.service.note;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import shop.esjh.memoryjar.dto.note.response.NoteRealtimeEventResponse;

import static org.mockito.Mockito.verify;

/*
 * NoteRealtimeServiceTest 역할
 *
 * 쪽지 실시간 이벤트가
 * 저금통 전체 주소와 기존 상세 주소에
 * 올바르게 전송되는지 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class NoteRealtimeServiceTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Test
    @DisplayName("쪽지 이벤트를 저금통 전체 주소와 기존 상세 주소에 전송한다")
    void sendNoteEvent_sendsToJarNotesTopic() {
        // given
        Long jarId = 10L;
        Long noteId = 1L;

        NoteRealtimeService service =
                new NoteRealtimeService(messagingTemplate);

        NoteRealtimeEventResponse event =
                NoteRealtimeEventResponse.reactionChanged(
                        jarId,
                        noteId,
                        100L,
                        "테스터"
                );

        // when
        service.sendNoteEventAfterCommit(
                jarId,
                noteId,
                event
        );

        // then
        verify(messagingTemplate).convertAndSend(
                "/topic/jars/10/notes",
                event
        );

        /*
         * 배포 중 기존 프론트와의 호환성을 위해
         * 예전 상세 주소에도 전달되는지 확인한다.
         */
        verify(messagingTemplate).convertAndSend(
                "/topic/jars/10/notes/1",
                event
        );
    }
}