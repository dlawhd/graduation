package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.config.properties.CloudflareAiProperties;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** Draft 잠금 안에서 시작·종료 상태를 직렬화하는 짧은 DB 트랜잭션을 검증한다. */
@ExtendWith(MockitoExtension.class)
class JarAiGenerationPersistenceServiceTest {

    @Mock private JarDesignDraftService draftService;
    @Mock private JarDesignDraftRepository draftRepository;
    @Mock private JarAiGenerationRepository generationRepository;

    @Test
    void start_rejectsDuplicateProcessingWhileDraftIsLocked() {
        JarAiGenerationPersistenceService service = service();
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftService.findOwnedActiveDraftForUpdate(1L, 10L)).thenReturn(draft);
        when(draft.getDraftId()).thenReturn(10L);
        when(generationRepository.existsByDraft_DraftIdAndStatus(10L, JarAiGenerationStatus.PROCESSING)).thenReturn(true);

        assertThatThrownBy(() -> service.start(1L, 10L, JarAiStyle.CUTE_2D, definition(), null))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.AI_GENERATION_ALREADY_PROCESSING);

        verify(generationRepository, never()).saveAndFlush(any());
    }

    @Test
    void start_preservesDraftOwnerErrorAndDoesNotCreateGeneration() {
        JarAiGenerationPersistenceService service = service();
        doThrow(new ApiException(AiDraftErrorCode.DRAFT_NOT_OWNER))
                .when(draftService).findOwnedActiveDraftForUpdate(2L, 10L);

        assertThatThrownBy(() -> service.start(2L, 10L, JarAiStyle.CUTE_2D, definition(), null))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_NOT_OWNER);

        verify(generationRepository, never()).existsByDraft_DraftIdAndStatus(anyLong(), any());
        verify(generationRepository, never()).saveAndFlush(any());
    }

    @Test
    void completeSucceeded_doesNotReviveGenerationAfterStaleTimeout() {
        JarAiGenerationPersistenceService service = service();
        JarDesignDraft draft = mock(JarDesignDraft.class);
        JarAiGeneration generation = mock(JarAiGeneration.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(generationRepository.findByGenerationIdAndDraft_DraftId(100L, 10L)).thenReturn(Optional.of(generation));
        when(generation.getStatus()).thenReturn(JarAiGenerationStatus.FAILED);

        boolean completed = service.completeSucceeded(10L, 100L, "candidate.png");

        assertThat(completed).isFalse();
        verify(generation, never()).markSucceeded(anyString(), any());
    }

    private JarAiGenerationPersistenceService service() {
        CloudflareAiProperties properties = new CloudflareAiProperties();
        properties.setModel("@cf/black-forest-labs/flux-2-klein-4b");
        return new JarAiGenerationPersistenceService(draftService, draftRepository, generationRepository, properties);
    }

    private AiPromptCatalog.AiPromptDefinition definition() {
        return new AiPromptCatalog.AiPromptDefinition("prompt", "BASE_V1+CUTE_2D_V1", null, null, null);
    }
}
