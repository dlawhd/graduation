package shop.esjh.memoryjar.repository.ai;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.JarDraftStatus;

import java.util.Optional;
import java.util.List;
import java.time.LocalDateTime;

/**
 * Draft를 조회하고, 경쟁 상태가 있는 작업에서는 Draft 행을 잠가 직렬화한다.
 */
public interface JarDesignDraftRepository extends JpaRepository<JarDesignDraft, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT draft
            FROM JarDesignDraft draft
            WHERE draft.draftId = :draftId
            """)
    Optional<JarDesignDraft> findByDraftIdForUpdate(@Param("draftId") Long draftId);

    @Query("""
            SELECT draft.draftId AS draftId
            FROM JarDesignDraft draft
            WHERE draft.status = :activeStatus
              AND draft.expiresAt <= :now
            ORDER BY draft.expiresAt ASC, draft.draftId ASC
            """)
    List<DraftReference> findActiveReferencesExpiredAtOrBefore(@Param("now") LocalDateTime now,
                                                                @Param("activeStatus") JarDraftStatus activeStatus,
                                                                org.springframework.data.domain.Pageable pageable);

    default List<DraftReference> findActiveReferencesExpiredAtOrBefore(LocalDateTime now, int batchSize) {
        return findActiveReferencesExpiredAtOrBefore(now, JarDraftStatus.ACTIVE,
                org.springframework.data.domain.PageRequest.of(0, batchSize));
    }

    @Query("""
            SELECT draft.draftId AS draftId, draft.originalS3Key AS originalS3Key
            FROM JarDesignDraft draft
            WHERE draft.status IN :terminalStatuses
              AND draft.updatedAt <= :terminalCutoff
              AND draft.originalS3DeletedAt IS NULL
            ORDER BY draft.draftId ASC
            """)
    List<DraftS3Reference> findUndeletedOriginalReferencesForTerminalDrafts(
            @Param("terminalCutoff") LocalDateTime terminalCutoff,
            @Param("terminalStatuses") List<JarDraftStatus> terminalStatuses,
            org.springframework.data.domain.Pageable pageable);

    default List<DraftS3Reference> findUndeletedOriginalReferencesForTerminalDrafts(
            LocalDateTime terminalCutoff, int batchSize) {
        return findUndeletedOriginalReferencesForTerminalDrafts(terminalCutoff,
                List.of(JarDraftStatus.FINALIZED, JarDraftStatus.ABANDONED, JarDraftStatus.EXPIRED),
                org.springframework.data.domain.PageRequest.of(0, batchSize));
    }

    interface DraftReference {
        Long getDraftId();
    }

    interface DraftS3Reference extends DraftReference {
        String getOriginalS3Key();
    }
}
