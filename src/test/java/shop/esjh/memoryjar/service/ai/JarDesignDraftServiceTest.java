package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;

import java.math.BigDecimal;
import java.util.Optional;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/**
 * Draft 후보 선택에서 OWNER, 잠금 조회, FAILED 후보 차단을 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class JarDesignDraftServiceTest {

    @Mock private JarDesignDraftRepository draftRepository;
    @Mock private JarAiGenerationRepository generationRepository;
    @Mock private AiDraftProperties properties;
    @InjectMocks private JarDesignDraftService draftService;

    @Test
    @DisplayName("FAILED 후보는 같은 Draft 소속이어도 선택할 수 없다")
    void selectAiGeneration_rejectsFailedCandidate() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        JarAiGeneration failedGeneration = mock(JarAiGeneration.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(draft.getDraftId()).thenReturn(10L);
        when(generationRepository.findByGenerationIdAndDraft_DraftId(20L, 10L)).thenReturn(Optional.of(failedGeneration));
        when(failedGeneration.isSelectableSucceededCandidate()).thenReturn(false);

        assertThatThrownBy(() -> draftService.selectAiGeneration(
                1L, 10L, 20L))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.AI_GENERATION_NOT_SELECTABLE);

        verify(draftRepository).findByDraftIdForUpdate(10L);
        verify(draft, never()).selectAiGeneration(anyLong());
    }

    @Test
    @DisplayName("타인의 Draft는 후보를 조회하기 전에 거절한다")
    void selectAiGeneration_rejectsNonOwner() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(2L)).thenReturn(false);

        assertThatThrownBy(() -> draftService.selectAiGeneration(
                2L, 10L, 20L))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_NOT_OWNER);

        verify(generationRepository, never()).findByGenerationIdAndDraft_DraftId(anyLong(), anyLong());
    }

    @Test
    @DisplayName("타인의 Draft 조회는 후보 목록을 읽기 전에 OWNER 오류로 거절한다")
    void getDraftSummary_rejectsNonOwner() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findById(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(2L)).thenReturn(false);

        assertThatThrownBy(() -> draftService.getDraftSummary(2L, 10L))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_NOT_OWNER);

        verify(generationRepository, never()).findByDraft_DraftIdOrderByGenerationIdDesc(anyLong());
    }

    @Test
    @DisplayName("다른 Draft에 속한 AI 후보 ID는 선택할 수 없다")
    void selectAiGeneration_rejectsCandidateFromAnotherDraft() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(draft.getDraftId()).thenReturn(10L);
        when(generationRepository.findByGenerationIdAndDraft_DraftId(20L, 10L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> draftService.selectAiGeneration(1L, 10L, 20L))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.AI_GENERATION_NOT_FOUND);

        verify(draft, never()).selectAiGeneration(anyLong());
    }

    @Test
    @DisplayName("DEFAULT 선택은 후보와 Slot을 비우고 Draft 만료를 7일 연장한다")
    void selectDefault_clearsSelectionAndExtendsExpiration() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(properties.getExpiresAfterDays()).thenReturn(7);

        draftService.selectDefault(1L, 10L);

        verify(draft).selectDefault();
        verify(draft).extendExpiration(any());
    }

    @Test
    @DisplayName("DEFAULT 또는 미선택 Draft에는 Slot을 저장할 수 없다")
    void updateSlot_rejectsDraftWithoutCustomSelection() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(draft.hasCustomDesignSelection()).thenReturn(false);

        assertThatThrownBy(() -> draftService.updateSlot(
                1L, 10L, new BigDecimal("0.5"), new BigDecimal("0.5"), new BigDecimal("0.3")))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_CUSTOM_SELECTION_REQUIRED);

        verify(draft, never()).updateSlot(any(), any(), any());
    }

    @Test
    @DisplayName("Slot은 ORIGINAL 또는 AI 선택에서만 0~1, 소수점 다섯째 자리까지 저장한다")
    void updateSlot_savesValidatedSlotAndExtendsExpiration() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(draft.hasCustomDesignSelection()).thenReturn(true);
        when(properties.getExpiresAfterDays()).thenReturn(7);

        draftService.updateSlot(1L, 10L,
                new BigDecimal("0.50000"), new BigDecimal("0.40000"), new BigDecimal("0.30000"));

        verify(draft).updateSlot(new BigDecimal("0.50000"), new BigDecimal("0.40000"), new BigDecimal("0.30000"));
        verify(draft).extendExpiration(any());
    }

    @Test
    void updateSlot_rejectsChangedCandidateWithoutWritingOrExtendingExpiration() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(draft.getSelectedDesignType()).thenReturn(JarDraftDesignType.AI);
        when(draft.getSelectedGenerationId()).thenReturn(22L);

        assertThatThrownBy(() -> draftService.updateSlot(1L, 10L,
                new BigDecimal("0.5"), new BigDecimal("0.5"), new BigDecimal("0.5"), JarDraftDesignType.AI, 21L))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode()).isEqualTo(AiDraftErrorCode.DRAFT_SLOT_TARGET_CHANGED);
        verify(draft, never()).updateSlot(any(), any(), any());
        verify(draft, never()).extendExpiration(any());
    }

    @Test
    void updateSlot_acceptsMatchingOriginalSnapshot() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(draft.getSelectedDesignType()).thenReturn(JarDraftDesignType.ORIGINAL);
        when(draft.getSelectedGenerationId()).thenReturn(null);
        when(draft.hasCustomDesignSelection()).thenReturn(true);
        when(properties.getExpiresAfterDays()).thenReturn(7);
        draftService.updateSlot(1L, 10L, new BigDecimal("0.5"), new BigDecimal("0.5"), BigDecimal.ZERO,
                JarDraftDesignType.ORIGINAL, null);
        verify(draft).updateSlot(new BigDecimal("0.5"), new BigDecimal("0.5"), BigDecimal.ZERO);
        verify(draft).extendExpiration(any());
    }

    @Test
    @DisplayName("범위를 벗어난 Slot 값은 기능별 입력 오류 코드로 거절한다")
    void updateSlot_rejectsInvalidSlotValue() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(draft.hasCustomDesignSelection()).thenReturn(true);

        assertThatThrownBy(() -> draftService.updateSlot(
                1L, 10L, new BigDecimal("1.00001"), new BigDecimal("0.5"), new BigDecimal("0.3")))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_SLOT_INVALID);

        verify(draft, never()).updateSlot(any(), any(), any());
    }
}
