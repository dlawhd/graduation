package shop.esjh.memoryjar.service.ai;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.dto.ai.response.JarDesignDraftDetailResponse;
import shop.esjh.memoryjar.dto.ai.JarDesignCutoutPoint;
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
import java.util.Objects;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import shop.esjh.memoryjar.dto.ai.request.JarDesignCompositionRequest;
import shop.esjh.memoryjar.entity.ai.JarPhotoFrame;

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
    private final JarDesignCutoutPathCodec cutoutPathCodec;

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
        List<List<JarDesignCutoutPoint>> cutoutRegions = cutoutPathCodec.decodeRegions(draft.getCutoutPathJson());
        List<JarDesignCutoutPoint> legacyCutoutPoints = cutoutRegions.isEmpty() ? List.of() : cutoutRegions.get(0);
        return new JarDesignDraftDetailResponse(draft.getDraftId(), draft.getStatus(), draft.getSelectedDesignType(), draft.getSelectedGenerationId(),
                draft.getSlotCenterX(), draft.getSlotCenterY(), draft.getSlotSizeRatio(), legacyCutoutPoints, cutoutRegions,
                draft.getExpiresAt(), draft.getFinalizedJar() == null ? null : draft.getFinalizedJar().getJarId(), generations,
                draft.getSlotStyle(), draft.getBodyStyle(), JarPhotoFrame.valueOf(draft.getPhotoFrame()),
                JarPhotoFrame.valueOf(draft.getOriginalContentFrame()));
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
        updateSlot(userId, draftId, centerX, centerY, sizeRatio, null, null);
    }

    /** 편집 화면의 선택 정보도 잠금 안에서 비교해 다른 탭에서 바뀐 후보에 좌표를 저장하지 않는다. */
    @Transactional
    public void updateSlot(Long userId, Long draftId,
                           BigDecimal centerX, BigDecimal centerY, BigDecimal sizeRatio,
                           JarDraftDesignType expectedDesignType, Long expectedGenerationId) {
        updateSlot(userId, draftId, centerX, centerY, sizeRatio, expectedDesignType, expectedGenerationId, null);
    }

    /** 기존 필드만 보내는 클라이언트는 모양을 유지하고, 명시한 모양만 같은 Draft 잠금 안에서 변경한다. */
    @Transactional
    public void updateSlot(Long userId, Long draftId,
                           BigDecimal centerX, BigDecimal centerY, BigDecimal sizeRatio,
                           JarDraftDesignType expectedDesignType, Long expectedGenerationId, JarSlotStyle slotStyle) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);
        // 기존 세 필드 요청은 호환 유지. 새 Editor는 선택 종류와 후보 ID를 항상 함께 보낸다.
        if ((expectedDesignType != null || expectedGenerationId != null)
                && (expectedDesignType != draft.getSelectedDesignType()
                || !Objects.equals(expectedGenerationId, draft.getSelectedGenerationId()))) {
            throw new ApiException(AiDraftErrorCode.DRAFT_SLOT_TARGET_CHANGED);
        }
        if (!draft.hasCustomDesignSelection()) {
            throw new ApiException(AiDraftErrorCode.DRAFT_CUSTOM_SELECTION_REQUIRED);
        }
        // 구 클라이언트가 모양을 생략해도 실제 저장된 자유형 높이로 검증해야 한다.
        JarSlotGeometry.validate(centerX, centerY, sizeRatio, slotStyle == null ? draft.getSlotStyle() : slotStyle);
        draft.updateSlot(centerX, centerY, sizeRatio);
        if (slotStyle != null) draft.updateSlotStyle(slotStyle);
        extendExpiration(draft);
    }

    /**
     * 현재 선택 이미지에만 외곽선을 저장한다. 빈 점 목록은 이미 저장한 외곽선을 지우는 명시적인 요청이다.
     * 선택 스냅샷을 함께 비교해 다른 탭에서 바뀐 후보의 외곽선을 덮어쓰지 않는다.
     */
    @Transactional
    public void updateCutout(Long userId, Long draftId, List<JarDesignCutoutPoint> points,
                             JarDraftDesignType expectedDesignType, Long expectedGenerationId) {
        updateCutoutRegions(userId, draftId,
                points == null || points.isEmpty() ? List.of() : List.of(points),
                expectedDesignType, expectedGenerationId);
    }

    /** 현재 선택 이미지에 여러 개의 분리된 선택 영역을 저장한다. */
    @Transactional
    public void updateCutoutRegions(Long userId, Long draftId, List<List<JarDesignCutoutPoint>> regions,
                                    JarDraftDesignType expectedDesignType, Long expectedGenerationId) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);
        if (expectedDesignType != draft.getSelectedDesignType()
                || !Objects.equals(expectedGenerationId, draft.getSelectedGenerationId())) {
            throw new ApiException(AiDraftErrorCode.DRAFT_CUTOUT_TARGET_CHANGED);
        }
        if (!draft.hasCustomDesignSelection()) {
            throw new ApiException(AiDraftErrorCode.DRAFT_CUSTOM_SELECTION_REQUIRED);
        }

        // 사진 창 채우기와 투명 외곽선은 다른 제작 방식이다. 오래된 탭이 채우기 위에 구멍을 만들지 못하게 한다.
        if (draft.getPhotoFrame() != null && regions != null && !regions.isEmpty())
            throw new ApiException(AiDraftErrorCode.DRAFT_PHOTO_FRAME_INVALID);
        if (regions == null || regions.isEmpty()) {
            draft.updateCutoutPathJson(null);
        } else {
            JarDesignCutoutGeometry.validateRegions(regions);
            draft.updateCutoutPathJson(cutoutPathCodec.encodeRegions(regions));
        }
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

    /** OWNER/만료 검사와 행 잠금 뒤 편집 시작 시의 후보·본체·배치를 비교해 오래된 탭의 덮어쓰기를 막는다. */
    @Transactional
    public void updateComposition(Long userId, Long draftId, JarDesignCompositionRequest request) {
        JarDesignDraft draft = findOwnedActiveDraftForUpdate(userId, draftId);
        if (request.expectedDesignType() != draft.getSelectedDesignType()
                || !Objects.equals(request.expectedGenerationId(), draft.getSelectedGenerationId())
                || request.expectedBodyStyle() != draft.getBodyStyle()
                || !Objects.equals(request.expectedPhotoFrame(), JarPhotoFrame.valueOf(draft.getPhotoFrame())))
            throw new ApiException(AiDraftErrorCode.DRAFT_COMPOSITION_TARGET_CHANGED);
        if (!draft.hasCustomDesignSelection())
            throw new ApiException(AiDraftErrorCode.DRAFT_CUSTOM_SELECTION_REQUIRED);
        if (!request.isCompositionConsistent())
            throw new ApiException(AiDraftErrorCode.DRAFT_PHOTO_FRAME_INVALID);
        if (request.photoFrame() != null) request.photoFrame().validate();
        // 변경 없는 반복 적용은 투입구/이미지 단독 외곽선을 지우지 않는 멱등 요청이다.
        if (request.bodyStyle() == draft.getBodyStyle()
                && Objects.equals(request.photoFrame(), JarPhotoFrame.valueOf(draft.getPhotoFrame()))) return;
        draft.updateComposition(request.bodyStyle(), request.photoFrame() == null ? null : new JarPhotoFrame(request.photoFrame()));
        extendExpiration(draft);
    }

}
