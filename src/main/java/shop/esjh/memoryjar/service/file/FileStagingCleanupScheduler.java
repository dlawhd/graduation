package shop.esjh.memoryjar.service.file;

import java.time.LocalDateTime;
import java.time.ZoneId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import shop.esjh.memoryjar.config.properties.S3Properties;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;

/** 업로드 취소나 삭제 실패로 남은 임시 파일을 제한된 묶음으로 정리한다. 완료 파일 주소는 삭제하지 않는다. */
@Component
public class FileStagingCleanupScheduler {
    private static final Logger log = LoggerFactory.getLogger(FileStagingCleanupScheduler.class);
    private final FileStagingCleanupPersistenceService persistence;
    private final S3Client s3;
    private final S3Properties properties;

    public FileStagingCleanupScheduler(FileStagingCleanupPersistenceService persistence, S3Client s3, S3Properties properties) {
        this.persistence = persistence; this.s3 = s3; this.properties = properties;
    }

    /** 성공한 삭제만 완료로 기록한다. 장애·재시작 시 DB 예약을 남겨 다시 시도한다. */
    @Scheduled(scheduler = "fileCleanupTaskScheduler", fixedDelayString = "${app.file-cleanup.fixed-delay-ms:300000}",
            initialDelayString = "${app.file-cleanup.initial-delay-ms:120000}")
    public void cleanup() {
        for (Long id : persistence.findDue(now())) {
            try {
                var key = persistence.claim(id, now());
                if (key.isEmpty()) continue;
                s3.deleteObject(DeleteObjectRequest.builder().bucket(properties.getBucket())
                        .key(S3PresignService.stagingKey(key.get())).build());
                persistence.markCleaned(id, now());
            } catch (RuntimeException failure) {
                // 사진 키·자격 증명·SDK 원문은 로그에 남기지 않는다. 다음 예약 때 재시도한다.
                log.warn("FILE_STAGING_CLEANUP_RETRY uploadId={} failureType={}", id, failure.getClass().getSimpleName());
            }
        }
    }

    private LocalDateTime now() { return LocalDateTime.now(ZoneId.of("Asia/Seoul")); }
}
