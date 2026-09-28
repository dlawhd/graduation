package shop.esjh.memoryjar.service.ai;

import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Service;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

/**
 * AI 후보 생성 요청을 DB에 먼저 접수하고 제한된 백그라운드 실행기로 전달한다.
 * 큐가 가득 차면 PROCESSING 상태를 실패로 닫고 안정적인 503 오류를 반환한다.
 */
@Service
public class JarAiGenerationRequestService {

    private final JarAiGenerationService generationService;
    private final JarAiGenerationAsyncWorker asyncWorker;

    public JarAiGenerationRequestService(JarAiGenerationService generationService,
                                         JarAiGenerationAsyncWorker asyncWorker) {
        this.generationService = generationService;
        this.asyncWorker = asyncWorker;
    }

    /** Generation ID를 확정한 뒤 작업만 위임하고 Cloudflare 결과를 기다리지 않는다. */
    public Long request(Long userId, Long draftId, JarAiStyle style, Long seed) {
        JarAiGenerationService.GenerationTask task = generationService.start(userId, draftId, style, seed);
        try {
            asyncWorker.process(task);
            return task.target().generationId();
        } catch (TaskRejectedException exception) {
            generationService.failQueueRejected(task);
            throw new ApiException(AiDraftErrorCode.AI_GENERATION_QUEUE_FULL);
        }
    }
}
