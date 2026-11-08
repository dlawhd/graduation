package shop.esjh.memoryjar.service.file;

import java.time.*;
import org.slf4j.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import shop.esjh.memoryjar.config.properties.S3Properties;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;

/** 7일간 연결되지 않은 NOTE 완료 파일을 한 번에 50개씩 정리하고, 저장소 장애 시 DB에 재시도를 남긴다. */
@Component
public class FileUnusedCleanupScheduler {
    private static final Logger log = LoggerFactory.getLogger(FileUnusedCleanupScheduler.class);
    private final FileUnusedCleanupPersistenceService persistence;
    private final S3Client s3;
    private final S3Properties storage;
    public FileUnusedCleanupScheduler(FileUnusedCleanupPersistenceService persistence, S3Client s3, S3Properties storage) {
        this.persistence = persistence; this.s3 = s3; this.storage = storage;
    }

    @Scheduled(scheduler = "fileCleanupTaskScheduler", fixedDelayString = "${app.file-cleanup.unused-delay-ms:300000}",
            initialDelayString = "${app.file-cleanup.unused-initial-delay-ms:180000}")
    public void cleanup() {
        for (Long id : persistence.findDue(now())) {
            try {
                var key = persistence.claim(id, now()); if (key.isEmpty()) continue;
                // DB 예약을 커밋한 뒤에만 외부 삭제를 수행한다. 실패·재시작 후 같은 고유 키 삭제는 재시도할 수 있다.
                s3.deleteObject(DeleteObjectRequest.builder().bucket(storage.getBucket()).key(key.get()).build());
                persistence.deleted(id, now());
            } catch (RuntimeException failure) {
                log.warn("UNUSED_UPLOAD_CLEANUP_RETRY uploadId={} failureType={}", id, failure.getClass().getSimpleName());
            }
        }
    }
    private LocalDateTime now() { return LocalDateTime.now(ZoneId.of("Asia/Seoul")); }
}
