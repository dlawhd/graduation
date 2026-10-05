package shop.esjh.memoryjar.repository.ai;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarDraftStatus;

import java.util.Optional;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Draft에 속한 AI 후보와 진행 중인 생성 작업을 조회한다.
 */
public interface JarAiGenerationRepository extends JpaRepository<JarAiGeneration, Long> {

    Optional<JarAiGeneration> findByGenerationIdAndDraft_DraftId(Long generationId, Long draftId);

    boolean existsByDraft_DraftIdAndStatus(Long draftId, JarAiGenerationStatus status);

    List<JarAiGeneration> findByDraft_DraftIdOrderByGenerationIdDesc(Long draftId);

    @Query(value = """
            SELECT generation.generationId AS generationId, generation.draft.draftId AS draftId
            FROM JarAiGeneration generation
            WHERE generation.status = :processingStatus
              AND generation.createdAt <= :cutoff
            ORDER BY generation.createdAt ASC, generation.generationId ASC
            """)
    List<GenerationReference> findProcessingReferencesCreatedBefore(@Param("cutoff") LocalDateTime cutoff,
                                                                      @Param("processingStatus") JarAiGenerationStatus processingStatus,
                                                                      org.springframework.data.domain.Pageable pageable);

    default List<GenerationReference> findProcessingReferencesCreatedBefore(LocalDateTime cutoff, int batchSize) {
        return findProcessingReferencesCreatedBefore(cutoff, JarAiGenerationStatus.PROCESSING,
                org.springframework.data.domain.PageRequest.of(0, batchSize));
    }

    @Query(value = """
            SELECT generation.generationId AS generationId, generation.draft.draftId AS draftId,
                   generation.generatedS3Key AS generatedS3Key
            FROM JarAiGeneration generation
            JOIN generation.draft draft
            WHERE draft.status IN :terminalStatuses
              AND draft.updatedAt <= :terminalCutoff
              AND generation.status = :succeededStatus
              AND generation.s3DeletedAt IS NULL
            ORDER BY generation.generationId ASC
            """)
    List<GenerationS3Reference> findUndeletedSucceededReferencesForTerminalDrafts(
            @Param("terminalCutoff") LocalDateTime terminalCutoff,
            @Param("terminalStatuses") List<JarDraftStatus> terminalStatuses,
            @Param("succeededStatus") JarAiGenerationStatus succeededStatus,
            org.springframework.data.domain.Pageable pageable);

    default List<GenerationS3Reference> findUndeletedSucceededReferencesForTerminalDrafts(
            LocalDateTime terminalCutoff, int batchSize) {
        return findUndeletedSucceededReferencesForTerminalDrafts(terminalCutoff,
                List.of(JarDraftStatus.FINALIZED, JarDraftStatus.ABANDONED, JarDraftStatus.EXPIRED),
                JarAiGenerationStatus.SUCCEEDED,
                org.springframework.data.domain.PageRequest.of(0, batchSize));
    }

    interface GenerationReference {
        Long getGenerationId();
        Long getDraftId();
    }

    // FAILED의 업로드 예약만 조회한다. 성공 후보와 영구 이미지는 이 정리 대상에 포함하지 않는다.
    @Query("""
            select g.generationId as generationId, g.draft.draftId as draftId,
                   g.candidateUploadS3Key as candidateKey
            from JarAiGeneration g
            where g.status = shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus.FAILED
              and g.candidateUploadS3Key is not null and g.candidateCleanupAt is null
              and g.completedAt <= :cutoff
            order by g.completedAt asc, g.generationId asc
            """)
    List<FailedCandidateReference> findFailedCandidateCleanupReferences(
            @Param("cutoff") LocalDateTime cutoff, org.springframework.data.domain.Pageable pageable);

    interface FailedCandidateReference extends GenerationReference {
        String getCandidateKey();
    }

    interface GenerationS3Reference extends GenerationReference {
        String getGeneratedS3Key();
    }
}
