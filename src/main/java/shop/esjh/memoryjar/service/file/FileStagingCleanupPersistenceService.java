package shop.esjh.memoryjar.service.file;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;

/** 만료된 업로드의 정리 예약만 짧은 DB 트랜잭션으로 처리한다. S3 통신 중에는 잠금을 잡지 않는다. */
@Service
public class FileStagingCleanupPersistenceService {
    private final FileUploadRepository uploads;

    public FileStagingCleanupPersistenceService(FileUploadRepository uploads) { this.uploads = uploads; }

    @Transactional(readOnly = true)
    public List<Long> findDue(LocalDateTime now) { return uploads.findStagingCleanupIds(now); }

    /** 만료를 다시 확인하고 미완료 업로드만 닫는다. COMPLETED·CONSUMED 상태는 바꾸지 않는다. */
    @Transactional
    public Optional<String> claim(Long id, LocalDateTime now) {
        Optional<String> key = uploads.findStagingKeyForUpdate(id);
        if (key.isEmpty() || uploads.claimStagingCleanup(id, now, now.plusMinutes(5)) != 1) return Optional.empty();
        return key;
    }

    @Transactional
    public void markCleaned(Long id, LocalDateTime now) { uploads.markStagingCleaned(id, now); }
}
