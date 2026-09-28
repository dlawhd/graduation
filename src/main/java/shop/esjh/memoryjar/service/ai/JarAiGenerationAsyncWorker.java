package shop.esjh.memoryjar.service.ai;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * 접수된 AI 생성 작업을 전용 제한 실행기에서 처리한다.
 * 실제 생성 규칙과 실패 기록은 JarAiGenerationService가 담당한다.
 */
@Service
public class JarAiGenerationAsyncWorker {

    private final JarAiGenerationService generationService;

    public JarAiGenerationAsyncWorker(JarAiGenerationService generationService) {
        this.generationService = generationService;
    }

    /** HTTP 응답과 분리된 ai-generation 스레드에서 후보 생성 전체 흐름을 실행한다. */
    @Async("aiGenerationTaskExecutor")
    public void process(JarAiGenerationService.GenerationTask task) {
        generationService.process(task);
    }
}
