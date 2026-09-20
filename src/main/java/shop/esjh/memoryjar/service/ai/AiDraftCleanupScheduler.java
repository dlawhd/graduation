package shop.esjh.memoryjar.service.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 서버가 주기적으로 stale AI 작업과 종료 Draft 임시 객체를 정리하도록 연결한다. */
@Component
public class AiDraftCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(AiDraftCleanupScheduler.class);

    private final AiDraftCleanupService cleanupService;

    public AiDraftCleanupScheduler(AiDraftCleanupService cleanupService) {
        this.cleanupService = cleanupService;
    }

    @Scheduled(fixedDelayString = "${app.ai-cleanup.scheduler-fixed-delay-ms:300000}",
            initialDelayString = "${app.ai-cleanup.scheduler-initial-delay-ms:60000}")
    public void cleanupExpiredAiDraftAssets() {
        AiDraftCleanupService.CleanupResult result = cleanupService.runCleanup();
        if (result.hasWork()) {
            log.info("[AI_DRAFT_CLEANUP] timeout={}, expiredDrafts={}, candidatesDeleted={}, originalsDeleted={}",
                    result.timedOut(), result.expiredDrafts(), result.candidatesDeleted(), result.originalsDeleted());
        }
    }
}
