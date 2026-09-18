package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarAiProvider;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/**
 * AI 생성 시작 시 Draft 잠금 뒤 PROCESSING 중복을 막는지 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class JarAiGenerationServiceTest {

    @Mock private JarDesignDraftService draftService;
    @Mock private JarAiGenerationRepository generationRepository;
    @InjectMocks private JarAiGenerationService generationService;

    @Test
    @DisplayName("같은 Draft에 PROCESSING 후보가 있으면 새 AI 생성을 거절한다")
    void startGeneration_rejectsDuplicateProcessing() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftService.findOwnedActiveDraftForUpdate(1L, 10L)).thenReturn(draft);
        when(draft.getDraftId()).thenReturn(10L);
        when(generationRepository.existsByDraft_DraftIdAndStatus(10L, JarAiGenerationStatus.PROCESSING)).thenReturn(true);

        assertThatThrownBy(() -> startGeneration())
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);

        verify(generationRepository, never()).save(any());
    }

    @Test
    @DisplayName("잠긴 Draft에서 PROCESSING이 없으면 새 PROCESSING 후보를 저장한다")
    void startGeneration_savesProcessingCandidate() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftService.findOwnedActiveDraftForUpdate(1L, 10L)).thenReturn(draft);
        when(draft.getDraftId()).thenReturn(10L);
        when(generationRepository.existsByDraft_DraftIdAndStatus(10L, JarAiGenerationStatus.PROCESSING)).thenReturn(false);
        when(generationRepository.save(any(JarAiGeneration.class))).thenAnswer(invocation -> invocation.getArgument(0));

        JarAiGeneration result = startGeneration();

        ArgumentCaptor<JarAiGeneration> captor = ArgumentCaptor.forClass(JarAiGeneration.class);
        verify(generationRepository).save(captor.capture());
        assertThat(result.getStatus()).isEqualTo(JarAiGenerationStatus.PROCESSING);
        assertThat(captor.getValue().getDraft()).isSameAs(draft);
    }

    private JarAiGeneration startGeneration() {
        return generationService.startGeneration(
                1L, 10L, JarAiStyle.CUTE_2D, JarAiProvider.CLOUDFLARE,
                "test-model", "BASE_V1+CUTE_2D_V1", 123L, null, null
        );
    }
}
