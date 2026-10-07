package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;

/** 기간이 지난 문의 사진/본문을 별도 실행 스레드에서 제한된 묶음으로 정리한다. */
@Component
@RequiredArgsConstructor
public class SupportCleanupScheduler {
    private final SupportInquiryService service;

    @Scheduled(scheduler = "supportCleanupTaskScheduler", fixedDelayString = "${app.support.cleanup-delay-ms:300000}",
            initialDelayString = "${app.support.cleanup-initial-delay-ms:120000}")
    public void cleanup() { service.cleanup(); }
}
