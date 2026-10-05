package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.config.properties.CloudflareAiProperties;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.entity.User;
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

    @Test void startCapturesOriginalCropSeparatelyFromSelectedAiOutputFrame() {
        var draft=mock(JarDesignDraft.class);var owner=mock(User.class);var saved=mock(JarAiGeneration.class);
        when(draftService.findOwnedActiveDraftForUpdate(1L,10L)).thenReturn(draft);
        when(draft.getDraftId()).thenReturn(10L);when(draft.getOwner()).thenReturn(owner);when(owner.getId()).thenReturn(1L);
        when(draft.getOriginalS3Key()).thenReturn("original.png");
        when(generationRepository.saveAndFlush(any())).thenReturn(saved);when(saved.getGenerationId()).thenReturn(100L);
        when(draft.getBodyStyle()).thenReturn(shop.esjh.memoryjar.enums.ai.JarBodyStyle.CAT);
        var original=new shop.esjh.memoryjar.entity.ai.JarPhotoFrame(JarAiInputImageProcessorTest.frame(".5","0",".5","1"));
        when(draft.getAiInputPhotoFrame()).thenReturn(original);
        var target=service().start(1L,10L,JarAiStyle.WATERCOLOR,definition(),null);
        assertThat(target.inputPhotoFrame()).isEqualTo(original.toValue());
        verify(draft,never()).getPhotoFrame();
    }

    @Test void oldAiOutputCropMustNotBeMistakenForOriginalCrop() {
        var draft=mock(JarDesignDraft.class);var owner=mock(User.class);var saved=mock(JarAiGeneration.class);
        when(draftService.findOwnedActiveDraftForUpdate(1L,10L)).thenReturn(draft);
        when(draft.getDraftId()).thenReturn(10L);when(draft.getOwner()).thenReturn(owner);when(owner.getId()).thenReturn(1L);
        when(draft.getOriginalS3Key()).thenReturn("original.png");
        when(generationRepository.saveAndFlush(any())).thenReturn(saved);when(saved.getGenerationId()).thenReturn(100L);
        when(draft.getBodyStyle()).thenReturn(shop.esjh.memoryjar.enums.ai.JarBodyStyle.CAT);
        when(draft.getSelectedDesignType()).thenReturn(shop.esjh.memoryjar.enums.ai.JarDraftDesignType.AI);
        assertThat(service().start(1L,10L,JarAiStyle.WATERCOLOR,definition(),null).inputPhotoFrame()).isNull();
        verify(draft,never()).getPhotoFrame();
    }

    @Mock private JarDesignDraftService draftService;
    @Mock private JarDesignDraftRepository draftRepository;
    @Mock private JarAiGenerationRepository generationRepository;

    @ParameterizedTest
    @EnumSource(value = JarAiStyle.class, names = {"PIXEL", "WEIRDO"})
    void start_recordsNewPromptVersionsWithoutInventingReferenceMetadata(JarAiStyle style) {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        User owner = mock(User.class);
        JarAiGeneration saved = mock(JarAiGeneration.class);
        when(draftService.findOwnedActiveDraftForUpdate(1L, 10L)).thenReturn(draft);
        when(draft.getDraftId()).thenReturn(10L);
        when(draft.getOwner()).thenReturn(owner);
        when(owner.getId()).thenReturn(1L);
        when(draft.getOriginalS3Key()).thenReturn("original.png");
        when(generationRepository.saveAndFlush(any())).thenReturn(saved);
        when(saved.getGenerationId()).thenReturn(100L);
        var prompt = new AiPromptCatalog().resolve(style);

        var target = service().start(1L, 10L, style, prompt, 7L);

        var generation = ArgumentCaptor.forClass(JarAiGeneration.class);
        verify(generationRepository).saveAndFlush(generation.capture());
        assertThat(target.generationId()).isEqualTo(100L);
        assertThat(generation.getValue().getPromptVersion()).isEqualTo(prompt.promptVersion());
        assertThat(generation.getValue().getReferenceImageVersion()).isNull();
        assertThat(generation.getValue().getPostprocessVersion()).isEqualTo(prompt.postprocessVersion());
        assertThat(generation.getValue().getSeed()).isEqualTo(7L);
        assertThat(generation.getValue().getStatus()).isEqualTo(JarAiGenerationStatus.PROCESSING);
    }

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

    @Test
    void uploadReservationSurvivesFailureAndKeepsExistingStatusContract() {
        var draft = mock(JarDesignDraft.class);
        var generation = JarAiGeneration.builder().draft(draft).aiStyle(JarAiStyle.CUTE_2D)
                .aiProvider(shop.esjh.memoryjar.enums.ai.JarAiProvider.CLOUDFLARE)
                .aiModel("fixture").promptVersion("fixture").build();
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(generationRepository.findByGenerationIdAndDraft_DraftId(100L, 10L)).thenReturn(Optional.of(generation));
        var persistence = service();
        assertThat(persistence.reserveCandidateUpload(10L, 100L, "candidate.png")).isTrue();
        assertThat(persistence.canCleanupFailedCandidate(10L, 100L, "candidate.png")).isFalse();
        generation.markFailed(shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode.S3_UPLOAD_FAILED,
                "정제된 설명", java.time.LocalDateTime.now());
        assertThat(generation.getGeneratedS3Key()).isNull();
        assertThat(generation.getS3DeletedAt()).isNull();
        assertThat(generation.getCandidateUploadS3Key()).isEqualTo("candidate.png");
        assertThat(persistence.canCleanupFailedCandidate(10L, 100L, "candidate.png")).isTrue();
        assertThat(persistence.canCleanupFailedCandidate(10L, 100L, "other.png")).isFalse();
        persistence.markFailedCandidateCleaned(10L, 100L, "candidate.png");
        assertThat(generation.getCandidateCleanupAt()).isNotNull();
        assertThat(persistence.canCleanupFailedCandidate(10L, 100L, "candidate.png")).isFalse();
    }

    @Test
    void committedSuccessIsNeverCompensatedEvenIfCallerLostCommitResponse() {
        var generation = JarAiGeneration.builder().draft(mock(JarDesignDraft.class)).aiStyle(JarAiStyle.CUTE_2D)
                .aiProvider(shop.esjh.memoryjar.enums.ai.JarAiProvider.CLOUDFLARE)
                .aiModel("fixture").promptVersion("fixture").build();
        generation.reserveCandidateUpload("candidate.png");
        generation.markSucceeded("candidate.png", java.time.LocalDateTime.now());
        when(generationRepository.findByGenerationIdAndDraft_DraftId(100L, 10L)).thenReturn(Optional.of(generation));
        assertThat(service().canCleanupFailedCandidate(10L, 100L, "candidate.png")).isFalse();
    }

    private AiPromptCatalog.AiPromptDefinition definition() {
        return new AiPromptCatalog.AiPromptDefinition("prompt", "BASE_V1+CUTE_2D_V1", null, null, null);
    }
}
