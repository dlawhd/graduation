package shop.esjh.memoryjar.service.ai;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.dto.jar.request.JarCreateRequest;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesign;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarDesignType;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;
import shop.esjh.memoryjar.enums.ai.JarDraftStatus;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignRepository;
import shop.esjh.memoryjar.service.jar.JarService;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Finalize의 DB 상태 검증과 Jar·JarDesign·Draft 확정을 짧은 트랜잭션으로 처리한다.
 * S3 복사는 이 서비스 밖에서 끝낸 뒤 들어오므로 네트워크 대기 동안 Draft 잠금을 잡지 않는다.
 */
@Service
public class JarDesignFinalizePersistenceService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final JarDesignDraftRepository draftRepository;
    private final JarAiGenerationRepository generationRepository;
    private final JarDesignRepository designRepository;
    private final JarService jarService;

    public JarDesignFinalizePersistenceService(JarDesignDraftRepository draftRepository,
                                               JarAiGenerationRepository generationRepository,
                                               JarDesignRepository designRepository,
                                               JarService jarService) {
        this.draftRepository = draftRepository;
        this.generationRepository = generationRepository;
        this.designRepository = designRepository;
        this.jarService = jarService;
    }

    /** S3 복사 전에 현재 선택을 잠금 아래에서 검증하고, 복사에 필요한 불변 Snapshot만 반환한다. */
    @Transactional
    public FinalizeTarget prepare(Long userId, Long draftId) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);
        return createTarget(draft);
    }

    /** DEFAULT는 외부 파일 없이 기존 Jar 생성 로직과 Draft 종료를 하나의 트랜잭션으로 확정한다. */
    @Transactional
    public FinalizeResult finalizeDefault(Long userId, Long draftId, JarCreateRequest request, FinalizeTarget expected) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);
        FinalizeTarget actual = createTarget(draft);
        requireSameTarget(expected, actual);
        if (actual.designType() != JarDraftDesignType.DEFAULT) {
            throw new ApiException(AiDraftErrorCode.FINALIZE_DEFAULT_SELECTION_REQUIRED);
        }

        Jar jar = jarService.createJarForDesignFinalize(userId, request);
        draft.markFinalized(jar);
        return new FinalizeResult(jar.getJarId(), JarDraftDesignType.DEFAULT);
    }

    /** 영구 S3 복사 뒤 선택이 바뀌지 않았을 때만 Jar·JarDesign·Draft를 함께 확정한다. */
    @Transactional
    public FinalizeResult finalizeCustom(Long userId, Long draftId, JarCreateRequest request,
                                         FinalizeTarget expected, String finalS3Key) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);
        FinalizeTarget actual = createTarget(draft);
        requireSameTarget(expected, actual);
        if (actual.designType() == JarDraftDesignType.DEFAULT) {
            throw new ApiException(AiDraftErrorCode.FINALIZE_CUSTOM_SELECTION_REQUIRED);
        }

        Jar jar = jarService.createJarForDesignFinalize(userId, request);
        JarAiGeneration selectedGeneration = actual.generationId() == null ? null
                : generationRepository.findByGenerationIdAndDraft_DraftId(actual.generationId(), draftId)
                .orElseThrow(() -> new IllegalStateException("최종화 대상 AI 후보를 다시 찾을 수 없습니다."));
        JarDesign design = JarDesign.builder()
                .jar(jar)
                .designType(toJarDesignType(actual.designType()))
                .finalS3Key(finalS3Key)
                .selectedGeneration(selectedGeneration)
                .slotCenterX(actual.slotCenterX())
                .slotCenterY(actual.slotCenterY())
                .slotSizeRatio(actual.slotSizeRatio())
                .build();
        designRepository.save(design);
        draft.markFinalized(jar);
        return new FinalizeResult(jar.getJarId(), actual.designType());
    }

    private JarDesignDraft findOwnedActiveDraftForUpdate(Long userId, Long draftId) {
        JarDesignDraft draft = draftRepository.findByDraftIdForUpdate(draftId)
                .orElseThrow(() -> new ApiException(AiDraftErrorCode.DRAFT_NOT_FOUND));
        if (!draft.isOwner(userId)) {
            throw new ApiException(AiDraftErrorCode.DRAFT_NOT_OWNER);
        }
        if (draft.getStatus() == JarDraftStatus.FINALIZED) {
            throw new ApiException(AiDraftErrorCode.DRAFT_ALREADY_FINALIZED);
        }
        if (!draft.isActiveAndNotExpired(LocalDateTime.now(KST))) {
            throw new ApiException(AiDraftErrorCode.DRAFT_NOT_ACTIVE);
        }
        if (generationRepository.existsByDraft_DraftIdAndStatus(draftId, JarAiGenerationStatus.PROCESSING)) {
            throw new ApiException(AiDraftErrorCode.DRAFT_PROCESSING_FINALIZE_BLOCKED);
        }
        return draft;
    }

    private FinalizeTarget createTarget(JarDesignDraft draft) {
        JarDraftDesignType selectedType = draft.getSelectedDesignType();
        if (selectedType == null) {
            throw new ApiException(AiDraftErrorCode.DRAFT_SELECTION_REQUIRED);
        }
        if (selectedType == JarDraftDesignType.DEFAULT) {
            return new FinalizeTarget(JarDraftDesignType.DEFAULT, null, null, null, null, null);
        }
        requireSlot(draft);
        if (selectedType == JarDraftDesignType.ORIGINAL) {
            return new FinalizeTarget(JarDraftDesignType.ORIGINAL, draft.getOriginalS3Key(), null,
                    draft.getSlotCenterX(), draft.getSlotCenterY(), draft.getSlotSizeRatio());
        }

        Long generationId = draft.getSelectedGenerationId();
        if (generationId == null) {
            throw new ApiException(AiDraftErrorCode.AI_GENERATION_SELECTION_REQUIRED);
        }
        JarAiGeneration generation = generationRepository.findByGenerationIdAndDraft_DraftId(generationId, draft.getDraftId())
                .orElseThrow(() -> new ApiException(AiDraftErrorCode.AI_GENERATION_NOT_FOUND));
        if (!generation.isSelectableSucceededCandidate()) {
            throw new ApiException(AiDraftErrorCode.AI_GENERATION_FINALIZE_NOT_SELECTABLE);
        }
        return new FinalizeTarget(JarDraftDesignType.AI, generation.getGeneratedS3Key(), generation.getGenerationId(),
                draft.getSlotCenterX(), draft.getSlotCenterY(), draft.getSlotSizeRatio());
    }

    private void requireSlot(JarDesignDraft draft) {
        if (draft.getSlotCenterX() == null || draft.getSlotCenterY() == null || draft.getSlotSizeRatio() == null) {
            throw new ApiException(AiDraftErrorCode.DRAFT_SLOT_REQUIRED);
        }
        // 과거에 저장된 중심값만 유효한 슬롯도 이미지 밖으로 나가면 최종화 전에 다시 편집한다.
        JarSlotGeometry.validate(draft.getSlotCenterX(), draft.getSlotCenterY(), draft.getSlotSizeRatio());
    }

    private void requireSameTarget(FinalizeTarget expected, FinalizeTarget actual) {
        if (!expected.equals(actual)) {
            throw new ApiException(AiDraftErrorCode.FINALIZE_TARGET_CHANGED);
        }
    }

    private JarDesignType toJarDesignType(JarDraftDesignType draftDesignType) {
        return switch (draftDesignType) {
            case ORIGINAL -> JarDesignType.ORIGINAL;
            case AI -> JarDesignType.AI;
            case DEFAULT -> throw new IllegalStateException("DEFAULT에는 JarDesign을 만들 수 없습니다.");
        };
    }

    /** S3 복사 전후에 비교하는 선택 종류·원본 Key·Generation·Slot의 불변 Snapshot이다. */
    public record FinalizeTarget(JarDraftDesignType designType, String sourceS3Key, Long generationId,
                                 BigDecimal slotCenterX, BigDecimal slotCenterY, BigDecimal slotSizeRatio) {
    }

    /** API 단계에서 기존 Jar 생성 응답과 연결할 최종 Jar 식별자와 디자인 종류다. */
    public record FinalizeResult(Long jarId, JarDraftDesignType designType) {
    }
}
