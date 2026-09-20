package shop.esjh.memoryjar.service.ai;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.dto.ai.response.JarDesignDraftDetailResponse;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.config.exception.ApiException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

/**
 * Draft OWNER가 유효한 후보와 Slot을 선택하도록 처리한다.
 * 후보 선택은 Draft 잠금 안에서 처리해, 동시에 들어온 선택 요청이 서로 덮어쓰지 않게 한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JarDesignDraftService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final JarDesignDraftRepository draftRepository;
    private final JarAiGenerationRepository generationRepository;
    private final AiDraftProperties properties;

    /** Draft 조회에는 S3 Key를 노출하지 않고 선택·Slot·후보 상태만 반환한다. */
    public JarDesignDraftDetailResponse getDraftSummary(Long userId, Long draftId) {
        JarDesignDraft draft = draftRepository.findById(draftId)
                .orElseThrow(() -> new ApiException(AiDraftErrorCode.DRAFT_NOT_FOUND));
        if (!draft.isOwner(userId)) {
            throw new ApiException(AiDraftErrorCode.DRAFT_NOT_OWNER);
        }
        List<JarDesignDraftDetailResponse.GenerationItem> generations = generationRepository.findByDraft_DraftIdOrderByGenerationIdDesc(draftId).stream()
                .map(generation -> new JarDesignDraftDetailResponse.GenerationItem(generation.getGenerationId(), generation.getAiStyle(), generation.getStatus(),
                        generation.getErrorCode(), generation.getCompletedAt()))
                .toList();
        return new JarDesignDraftDetailResponse(draft.getDraftId(), draft.getStatus(), draft.getSelectedDesignType(), draft.getSelectedGenerationId(),
                draft.getSlotCenterX(), draft.getSlotCenterY(), draft.getSlotSizeRatio(), draft.getExpiresAt(), draft.getFinalizedJar() == null ? null : draft.getFinalizedJar().getJarId(), generations);
    }

    /**
     * 성공했고 아직 정리되지 않은 같은 Draft의 AI 후보만 최종 후보로 선택한다.
     */
    @Transactional
    public void selectAiGeneration(Long userId, Long draftId, Long generationId) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);

        JarAiGeneration generation = generationRepository
                .findByGenerationIdAndDraft_DraftId(generationId, draft.getDraftId())
                .orElseThrow(() -> new ApiException(AiDraftErrorCode.AI_GENERATION_NOT_FOUND));

        // DB FK는 같은 Draft 소속만 보장한다. FAILED/처리 중/삭제된 S3 후보 차단은 서비스 책임이다.
        if (!generation.isSelectableSucceededCandidate()) {
            throw new ApiException(AiDraftErrorCode.AI_GENERATION_NOT_SELECTABLE);
        }

        draft.selectAiGeneration(generation.getGenerationId());
        extendExpiration(draft);
    }

    /**
     * 원본 디자인 선택도 같은 OWNER·활성 Draft 규칙 아래에서 처리한다.
     */
    @Transactional
    public void selectOriginal(Long userId, Long draftId) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);
        draft.selectOriginal();
        extendExpiration(draft);
    }

    /**
     * 사용자가 직접 디자인을 포기하고 기존 기본 Jar 방식으로 돌아가도록 설정한다.
     */
    @Transactional
    public void selectDefault(Long userId, Long draftId) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);
        draft.selectDefault();
        extendExpiration(draft);
    }

    /**
     * 현재 ORIGINAL 또는 AI 선택에만 Slot을 저장한다.
     * 미선택/DEFAULT 상태에서 Slot을 남기는 것은 V32 CHECK 제약과 충돌하므로 서비스에서도 먼저 막는다.
     */
    @Transactional
    public void updateSlot(Long userId, Long draftId,
                           BigDecimal centerX, BigDecimal centerY, BigDecimal sizeRatio) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);
        if (!draft.hasCustomDesignSelection()) {
            throw new ApiException(AiDraftErrorCode.DRAFT_CUSTOM_SELECTION_REQUIRED);
        }
        validateSlot(centerX, centerY, sizeRatio);
        draft.updateSlot(centerX, centerY, sizeRatio);
        extendExpiration(draft);
    }

    /**
     * 상태 변경 전 Draft 행을 잠그고, 타인·만료·종료 Draft를 일관되게 거절한다.
     */
    JarDesignDraft findOwnedActiveDraftForUpdate(Long userId, Long draftId) {
        JarDesignDraft draft = draftRepository.findByDraftIdForUpdate(draftId)
                .orElseThrow(() -> new ApiException(AiDraftErrorCode.DRAFT_NOT_FOUND));

        if (!draft.isOwner(userId)) {
            throw new ApiException(AiDraftErrorCode.DRAFT_NOT_OWNER);
        }
        if (!draft.isActiveAndNotExpired(LocalDateTime.now(KST))) {
            throw new ApiException(AiDraftErrorCode.DRAFT_NOT_ACTIVE);
        }
        return draft;
    }

    private void extendExpiration(JarDesignDraft draft) {
        draft.extendExpiration(LocalDateTime.now(KST).plusDays(properties.getExpiresAfterDays()));
    }

    private void validateSlot(BigDecimal centerX, BigDecimal centerY, BigDecimal sizeRatio) {
        validateSlotValue(centerX, "slotCenterX");
        validateSlotValue(centerY, "slotCenterY");
        validateSlotValue(sizeRatio, "slotSizeRatio");
    }

    private void validateSlotValue(BigDecimal value, String fieldName) {
        if (value == null
                || value.scale() > 5
                || value.compareTo(BigDecimal.ZERO) < 0
                || value.compareTo(BigDecimal.ONE) > 0) {
            throw new ApiException(AiDraftErrorCode.DRAFT_SLOT_INVALID);
        }
    }

}
