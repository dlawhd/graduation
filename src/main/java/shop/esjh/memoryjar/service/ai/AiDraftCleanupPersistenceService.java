package shop.esjh.memoryjar.service.ai;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarDraftStatus;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * stale Generation과 종료 Draft 정리에 필요한 짧은 DB 트랜잭션을 담당한다.
 * 실제 S3 삭제는 이 클래스 밖에서 실행해 네트워크 대기 중 DB 잠금을 잡지 않는다.
 */
@Service
public class AiDraftCleanupPersistenceService {

    private final JarDesignDraftRepository draftRepository;
    private final JarAiGenerationRepository generationRepository;

    public AiDraftCleanupPersistenceService(JarDesignDraftRepository draftRepository,
                                            JarAiGenerationRepository generationRepository) {
        this.draftRepository = draftRepository;
        this.generationRepository = generationRepository;
    }

    @Transactional(readOnly = true)
    public List<JarAiGenerationRepository.GenerationReference> findStaleGenerationReferences(
            LocalDateTime cutoff, int batchSize) {
        return generationRepository.findProcessingReferencesCreatedBefore(cutoff, batchSize);
    }

    @Transactional(readOnly = true)
    public List<JarDesignDraftRepository.DraftReference> findExpiredDraftReferences(LocalDateTime now, int batchSize) {
        return draftRepository.findActiveReferencesExpiredAtOrBefore(now, batchSize);
    }

    @Transactional(readOnly = true)
    public List<JarAiGenerationRepository.GenerationS3Reference> findTerminalCandidateReferences(
            LocalDateTime terminalCutoff, int batchSize) {
        return generationRepository.findUndeletedSucceededReferencesForTerminalDrafts(terminalCutoff, batchSize);
    }

    @Transactional(readOnly = true)
    public List<JarDesignDraftRepository.DraftS3Reference> findTerminalOriginalReferences(
            LocalDateTime terminalCutoff, int batchSize) {
        return draftRepository.findUndeletedOriginalReferencesForTerminalDrafts(terminalCutoff, batchSize);
    }

    /** Draft 잠금 아래에서 여전히 오래된 PROCESSING 시도만 timeout 실패로 바꾼다. */
    @Transactional
    public Optional<GenerationCleanupTarget> timeoutIfStillStale(Long draftId, Long generationId,
                                                                   LocalDateTime cutoff, LocalDateTime now) {
        JarDesignDraft draft = draftRepository.findByDraftIdForUpdate(draftId).orElse(null);
        if (draft == null) {
            return Optional.empty();
        }
        JarAiGeneration generation = generationRepository.findByGenerationIdAndDraft_DraftId(generationId, draftId)
                .orElse(null);
        if (generation == null || generation.getStatus() != JarAiGenerationStatus.PROCESSING
                || generation.getCreatedAt() == null || generation.getCreatedAt().isAfter(cutoff)) {
            return Optional.empty();
        }

        generation.markFailed(JarAiGenerationErrorCode.GENERATION_TIMEOUT,
                "AI 생성 시간이 제한을 초과했습니다.", now);
        return Optional.of(new GenerationCleanupTarget(draft.getOwner().getId(), draftId, generationId));
    }

    /** PROCESSING이 없는, 실제 만료 시각이 지난 ACTIVE Draft만 EXPIRED로 종료한다. */
    @Transactional
    public boolean expireIfDue(Long draftId, LocalDateTime now) {
        JarDesignDraft draft = draftRepository.findByDraftIdForUpdate(draftId).orElse(null);
        if (draft == null || draft.getStatus() != JarDraftStatus.ACTIVE || draft.getExpiresAt().isAfter(now)) {
            return false;
        }
        // 생성 중인 AI가 원본을 읽는 동안 Draft를 종료·정리하지 않도록 timeout 처리까지 기다린다.
        if (generationRepository.existsByDraft_DraftIdAndStatus(draftId, JarAiGenerationStatus.PROCESSING)) {
            return false;
        }
        draft.markExpired();
        return true;
    }

    /** S3 삭제를 마친 후보만, 종료 Draft임을 다시 확인한 뒤 삭제 완료 시각을 기록한다. */
    @Transactional
    public boolean markCandidateS3Deleted(Long draftId, Long generationId, String generatedS3Key, LocalDateTime now) {
        JarDesignDraft draft = draftRepository.findByDraftIdForUpdate(draftId).orElse(null);
        if (draft == null || !draft.isTerminal()) {
            return false;
        }
        JarAiGeneration generation = generationRepository.findByGenerationIdAndDraft_DraftId(generationId, draftId)
                .orElse(null);
        if (generation == null || generation.getStatus() != JarAiGenerationStatus.SUCCEEDED
                || generation.getS3DeletedAt() != null || !generatedS3Key.equals(generation.getGeneratedS3Key())) {
            return false;
        }
        generation.markS3Deleted(now);
        return true;
    }

    /** S3 삭제를 마친 원본만, 종료 Draft임을 다시 확인한 뒤 삭제 완료 시각을 기록한다. */
    @Transactional
    public boolean markOriginalS3Deleted(Long draftId, String originalS3Key, LocalDateTime now) {
        JarDesignDraft draft = draftRepository.findByDraftIdForUpdate(draftId).orElse(null);
        if (draft == null || !draft.isTerminal() || draft.getOriginalS3DeletedAt() != null
                || !originalS3Key.equals(draft.getOriginalS3Key())) {
            return false;
        }
        draft.markOriginalS3Deleted(now);
        return true;
    }

    /** stale 후보의 DB ID와 소유 Draft 정보만 담아 S3 Key를 안전하게 재구성한다. */
    public record GenerationCleanupTarget(Long ownerId, Long draftId, Long generationId) {
    }
}
