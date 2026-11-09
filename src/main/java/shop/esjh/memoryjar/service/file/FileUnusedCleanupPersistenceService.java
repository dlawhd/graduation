package shop.esjh.memoryjar.service.file;

import java.time.LocalDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;

/** 미사용 완료 파일의 삭제 권한만 DB에서 확보한다. 첨부 연결과 경합해도 사용 중인 파일은 확보하지 않는다. */
@Service
public class FileUnusedCleanupPersistenceService {
    private final FileUploadRepository uploads;
    public FileUnusedCleanupPersistenceService(FileUploadRepository uploads) { this.uploads = uploads; }

    @Transactional(readOnly = true)
    public List<Long> findDue(LocalDateTime now) { return uploads.findUnusedCleanupIds(now); }

    @Transactional
    public Optional<String> claim(Long id, LocalDateTime now) {
        var key = uploads.findStagingKeyForUpdate(id);
        if (key.isEmpty() || !(key.get().startsWith("notes/") || key.get().startsWith("profiles/") || key.get().startsWith("jars/")) || key.get().endsWith(".pending")) return Optional.empty();
        if (uploads.claimUnusedCleanup(id, now, now.plusMinutes(5)) != 1) return Optional.empty();
        return key;
    }

    @Transactional
    public void deleted(Long id, LocalDateTime now) { uploads.markUnusedCleaned(id, now); }
}
