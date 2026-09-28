package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.task.TaskRejectedException;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/** AI 생성 접수 API가 외부 제공자를 기다리지 않고 작업만 위임하는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class JarAiGenerationRequestServiceTest {

    @Mock private JarAiGenerationService generationService;
    @Mock private JarAiGenerationAsyncWorker asyncWorker;

    @Test
    void request_returnsGenerationIdAfterSubmittingBackgroundTask() {
        JarAiGenerationService.GenerationTask task = task();
        when(generationService.start(1L, 10L, JarAiStyle.CUTE_2D, 7L)).thenReturn(task);
        JarAiGenerationRequestService service = new JarAiGenerationRequestService(generationService, asyncWorker);

        Long generationId = service.request(1L, 10L, JarAiStyle.CUTE_2D, 7L);

        assertThat(generationId).isEqualTo(100L);
        verify(asyncWorker).process(task);
    }

    @Test
    void request_closesProcessingGenerationWhenExecutorQueueIsFull() {
        JarAiGenerationService.GenerationTask task = task();
        when(generationService.start(1L, 10L, JarAiStyle.CUTE_2D, null)).thenReturn(task);
        doThrow(new TaskRejectedException("queue full")).when(asyncWorker).process(task);
        JarAiGenerationRequestService service = new JarAiGenerationRequestService(generationService, asyncWorker);

        assertThatThrownBy(() -> service.request(1L, 10L, JarAiStyle.CUTE_2D, null))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(AiDraftErrorCode.AI_GENERATION_QUEUE_FULL));
        verify(generationService).failQueueRejected(task);
    }

    private JarAiGenerationService.GenerationTask task() {
        var definition = new AiPromptCatalog.AiPromptDefinition(
                "test", "BASE_V2+CUTE_2D_V2", null, null, null);
        var target = new JarAiGenerationPersistenceService.GenerationStartTarget(
                100L, 10L, 1L, "original.png");
        return new JarAiGenerationService.GenerationTask(target, definition, JarAiStyle.CUTE_2D,
                null, 1L, 2L);
    }
}
