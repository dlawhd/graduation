package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.dto.jar.request.JarCreateRequest;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesign;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.entity.ai.JarPhotoFrame;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarDesignType;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarTheme;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignRepository;
import shop.esjh.memoryjar.service.jar.JarService;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/** Finalize가 잠금 직후 OWNER를 확인해 타인의 Jar 생성·S3 복사로 진행하지 않는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class JarDesignFinalizePersistenceServiceTest {

    @Mock private JarDesignDraftRepository draftRepository;
    @Mock private JarAiGenerationRepository generationRepository;
    @Mock private JarDesignRepository designRepository;
    @Mock private JarService jarService;

    @Test
    void prepare_rejectsNonOwnerBeforeGenerationLookup() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(2L)).thenReturn(false);

        assertThatThrownBy(() -> service().prepare(2L, 10L))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_NOT_OWNER);

        verify(generationRepository, never()).existsByDraft_DraftIdAndStatus(anyLong(), any());
        verifyNoInteractions(jarService, designRepository);
    }

    @Test
    void prepare_blocksFinalizeWhileGenerationIsProcessing() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(generationRepository.existsByDraft_DraftIdAndStatus(10L, JarAiGenerationStatus.PROCESSING)).thenReturn(true);

        assertThatThrownBy(() -> service().prepare(1L, 10L))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_PROCESSING_FINALIZE_BLOCKED);

        verifyNoInteractions(jarService, designRepository);
    }

    @Test
    void finalizeDefault_createsJarAndFinalizesDraftWithoutJarDesign() {
        JarDesignDraft draft = activeDraft(JarDraftDesignType.DEFAULT);
        Jar jar = mock(Jar.class);
        when(jar.getJarId()).thenReturn(101L);
        when(jarService.createJarForDesignFinalize(eq(1L), any())).thenReturn(jar);

        var result = service().finalizeDefault(1L, 10L, request(), defaultTarget());

        assertThat(result.jarId()).isEqualTo(101L);
        assertThat(result.designType()).isEqualTo(JarDraftDesignType.DEFAULT);
        verify(draft).markFinalized(jar);
        verifyNoInteractions(designRepository);
    }

    @Test
    void finalizeCustom_originalCreatesOriginalJarDesignAndFinalizesDraft() {
        JarDesignDraft draft = activeDraft(JarDraftDesignType.ORIGINAL);
        when(draft.getOriginalS3Key()).thenReturn("original.png");
        stubSlot(draft);
        Jar jar = mock(Jar.class);
        when(jar.getJarId()).thenReturn(102L);
        when(jarService.createJarForDesignFinalize(eq(1L), any())).thenReturn(jar);

        var result = service().finalizeCustom(1L, 10L, request(), originalTarget(), "final.png");

        assertThat(result.jarId()).isEqualTo(102L);
        assertThat(result.designType()).isEqualTo(JarDraftDesignType.ORIGINAL);
        verify(designRepository).save(argThat((JarDesign design) ->
                design.getJar() == jar
                        && design.getDesignType() == JarDesignType.ORIGINAL
                        && design.getFinalS3Key().equals("final.png")
                        && design.getSelectedGeneration() == null));
        verify(draft).markFinalized(jar);
    }

    @Test
    void finalizeCustom_aiCreatesAiJarDesignWithSelectedGeneration() {
        JarDesignDraft draft = activeDraft(JarDraftDesignType.AI);
        when(draft.getBodyStyle()).thenReturn(JarBodyStyle.WHALE);
        when(draft.getDraftId()).thenReturn(10L);
        when(draft.getSelectedGenerationId()).thenReturn(200L);
        stubSlot(draft);
        JarAiGeneration generation = mock(JarAiGeneration.class);
        when(generation.isSelectableSucceededCandidate()).thenReturn(true);
        when(generation.getGeneratedS3Key()).thenReturn("candidate.png");
        when(generation.getGenerationId()).thenReturn(200L);
        when(generationRepository.findByGenerationIdAndDraft_DraftId(200L, 10L)).thenReturn(Optional.of(generation));
        Jar jar = mock(Jar.class);
        when(jar.getJarId()).thenReturn(103L);
        when(jarService.createJarForDesignFinalize(eq(1L), any())).thenReturn(jar);

        var result = service().finalizeCustom(1L, 10L, request(), service().prepare(1L, 10L), "final.png");

        assertThat(result.jarId()).isEqualTo(103L);
        assertThat(result.designType()).isEqualTo(JarDraftDesignType.AI);
        verify(designRepository).save(argThat((JarDesign design) ->
                design.getDesignType() == JarDesignType.AI
                        && design.getFinalS3Key().equals("final.png")
                        && design.getSelectedGeneration() == generation
                        && design.getBodyStyle() == JarBodyStyle.WHALE));
        verify(draft).markFinalized(jar);
    }

    @Test
    void prepare_rejectsPreviouslyStoredSlotOutsideImageBeforeJarCreation() {
        JarDesignDraft draft = activeDraft(JarDraftDesignType.ORIGINAL);
        when(draft.getSlotCenterX()).thenReturn(BigDecimal.ZERO);
        when(draft.getSlotCenterY()).thenReturn(new BigDecimal("0.5"));
        when(draft.getSlotSizeRatio()).thenReturn(BigDecimal.ONE);
        assertThatThrownBy(() -> service().prepare(1L, 10L))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode()).isEqualTo(AiDraftErrorCode.DRAFT_SLOT_OUT_OF_BOUNDS);
        verifyNoInteractions(jarService, designRepository);
    }

    private JarDesignFinalizePersistenceService service() {
        return new JarDesignFinalizePersistenceService(draftRepository, generationRepository, designRepository, jarService);
    }

    @Test
    void finalizeCustomCopiesFrameAndRejectsFrameChangedDuringS3Copy() {
        JarDesignDraft draft = activeDraft(JarDraftDesignType.ORIGINAL);
        when(draft.getOriginalS3Key()).thenReturn("original.png");
        when(draft.getBodyStyle()).thenReturn(JarBodyStyle.CAT);
        var frame = new JarPhotoFrameValue(new BigDecimal("0.1"),new BigDecimal("0.2"),new BigDecimal("0.7"),new BigDecimal("0.5"));
        when(draft.getPhotoFrame()).thenReturn(new JarPhotoFrame(frame));
        stubSlot(draft);
        var expected = service().prepare(1L,10L);
        assertThat(expected.photoFrame()).isEqualTo(frame);
        when(draft.getPhotoFrame()).thenReturn(null);
        assertThatThrownBy(() -> service().finalizeCustom(1L,10L,request(),expected,"final.png"))
                .isInstanceOf(ApiException.class).extracting(e -> ((ApiException)e).getErrorCode()).isEqualTo(AiDraftErrorCode.FINALIZE_TARGET_CHANGED);
        verifyNoInteractions(jarService,designRepository);
        when(draft.getPhotoFrame()).thenReturn(new JarPhotoFrame(frame));
        Jar jar=mock(Jar.class); when(jar.getJarId()).thenReturn(102L); when(jarService.createJarForDesignFinalize(eq(1L),any())).thenReturn(jar);
        service().finalizeCustom(1L,10L,request(),expected,"final.png");
        verify(designRepository).save(argThat(design -> frame.equals(JarPhotoFrame.valueOf(design.getPhotoFrame()))));
    }

    @Test
    void finalizeCustom_preservesSelectedSlotStyle() {
        JarDesignDraft draft = activeDraft(JarDraftDesignType.ORIGINAL);
        when(draft.getOriginalS3Key()).thenReturn("original.png");
        when(draft.getSlotStyle()).thenReturn(JarSlotStyle.METAL);
        when(draft.getBodyStyle()).thenReturn(JarBodyStyle.CAT);
        stubSlot(draft);
        Jar jar = mock(Jar.class);
        when(jar.getJarId()).thenReturn(104L);
        when(jarService.createJarForDesignFinalize(eq(1L), any())).thenReturn(jar);
        var expected = service().prepare(1L, 10L);

        service().finalizeCustom(1L, 10L, request(), expected, "final.png");

        verify(designRepository).save(argThat(design -> design.getSlotStyle() == JarSlotStyle.METAL));
        assertThat(expected.bodyStyle()).isEqualTo(JarBodyStyle.CAT);
        verify(designRepository).save(argThat(design -> design.getBodyStyle() == JarBodyStyle.CAT));
    }

    @Test
    void finalizeCustom_rejectsBodyChangedDuringExternalCopy() {
        JarDesignDraft draft = activeDraft(JarDraftDesignType.ORIGINAL);
        when(draft.getOriginalS3Key()).thenReturn("original.png");
        when(draft.getBodyStyle()).thenReturn(JarBodyStyle.CAT);
        stubSlot(draft);
        var expected = service().prepare(1L, 10L);
        when(draft.getBodyStyle()).thenReturn(JarBodyStyle.BEAR);
        assertThatThrownBy(() -> service().finalizeCustom(1L, 10L, request(), expected, "final.png"))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode()).isEqualTo(AiDraftErrorCode.FINALIZE_TARGET_CHANGED);
        verifyNoInteractions(jarService, designRepository);
    }

    @Test
    void finalizeCustom_rejectsStyleChangedDuringExternalCopy() {
        JarDesignDraft draft = activeDraft(JarDraftDesignType.ORIGINAL);
        when(draft.getOriginalS3Key()).thenReturn("original.png");
        when(draft.getSlotStyle()).thenReturn(JarSlotStyle.METAL);
        stubSlot(draft);
        var expected = service().prepare(1L, 10L);
        when(draft.getSlotStyle()).thenReturn(JarSlotStyle.WOOD);

        assertThatThrownBy(() -> service().finalizeCustom(1L, 10L, request(), expected, "final.png"))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode()).isEqualTo(AiDraftErrorCode.FINALIZE_TARGET_CHANGED);
        verifyNoInteractions(jarService, designRepository);
    }

    private JarDesignDraft activeDraft(JarDraftDesignType designType) {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(draft.getSelectedDesignType()).thenReturn(designType);
        when(generationRepository.existsByDraft_DraftIdAndStatus(10L, JarAiGenerationStatus.PROCESSING)).thenReturn(false);
        return draft;
    }

    private void stubSlot(JarDesignDraft draft) {
        when(draft.getSlotCenterX()).thenReturn(new BigDecimal("0.50000"));
        when(draft.getSlotCenterY()).thenReturn(new BigDecimal("0.40000"));
        when(draft.getSlotSizeRatio()).thenReturn(new BigDecimal("0.30000"));
    }

    private JarDesignFinalizePersistenceService.FinalizeTarget defaultTarget() {
        return new JarDesignFinalizePersistenceService.FinalizeTarget(JarDraftDesignType.DEFAULT, null, null, null, null, null);
    }

    private JarDesignFinalizePersistenceService.FinalizeTarget originalTarget() {
        return new JarDesignFinalizePersistenceService.FinalizeTarget(JarDraftDesignType.ORIGINAL, "original.png", null,
                new BigDecimal("0.50000"), new BigDecimal("0.40000"), new BigDecimal("0.30000"));
    }

    private JarDesignFinalizePersistenceService.FinalizeTarget aiTarget() {
        return new JarDesignFinalizePersistenceService.FinalizeTarget(JarDraftDesignType.AI, "candidate.png", 200L,
                new BigDecimal("0.50000"), new BigDecimal("0.40000"), new BigDecimal("0.30000"));
    }

    private JarCreateRequest request() {
        return new JarCreateRequest("디자인 Jar", null, JarTheme.SPRING, 2, LocalDateTime.now().plusDays(1),
                JarOpenMode.ALL_AT_ONCE, JarLockLevel.HIDDEN);
    }
}
