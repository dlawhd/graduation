package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;

import java.math.BigDecimal;
import java.util.Optional;

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
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);

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
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);

        verify(generationRepository, never()).findByGenerationIdAndDraft_DraftId(anyLong(), anyLong());
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
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);

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
}
