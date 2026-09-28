package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationRealtimeEventResponse;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** AI 생성 완료 WebSocket 이벤트의 주소·내용과 전송 실패 격리를 검증한다. */
@ExtendWith(MockitoExtension.class)
class JarAiGenerationRealtimeServiceTest {

    @Mock private SimpMessagingTemplate messagingTemplate;

    @Test
    void sendCompleted_publishesDraftScopedEvent() {
        JarAiGenerationRealtimeService service = new JarAiGenerationRealtimeService(messagingTemplate);
        ArgumentCaptor<JarAiGenerationRealtimeEventResponse> eventCaptor =
                ArgumentCaptor.forClass(JarAiGenerationRealtimeEventResponse.class);

        service.sendCompleted(10L, 100L, JarAiStyle.PIXEL,
                JarAiGenerationStatus.FAILED, JarAiGenerationErrorCode.PIXEL_POSTPROCESS_FAILED);

        verify(messagingTemplate).convertAndSend(
                eq("/topic/design-drafts/10/generations"), eventCaptor.capture());
        assertThat(eventCaptor.getValue().draftId()).isEqualTo(10L);
        assertThat(eventCaptor.getValue().generationId()).isEqualTo(100L);
        assertThat(eventCaptor.getValue().errorCode()).isEqualTo(JarAiGenerationErrorCode.PIXEL_POSTPROCESS_FAILED);
    }

    @Test
    void sendCompleted_doesNotRollbackResultWhenWebSocketSendFails() {
        doThrow(new IllegalStateException("broker unavailable"))
                .when(messagingTemplate).convertAndSend(anyString(), any(Object.class));
        JarAiGenerationRealtimeService service = new JarAiGenerationRealtimeService(messagingTemplate);

        assertThatCode(() -> service.sendCompleted(10L, 100L, JarAiStyle.CUTE_2D,
                JarAiGenerationStatus.SUCCEEDED, null)).doesNotThrowAnyException();
    }
}
