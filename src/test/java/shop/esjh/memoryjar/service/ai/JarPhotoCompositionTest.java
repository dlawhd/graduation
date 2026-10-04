package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;
import shop.esjh.memoryjar.dto.ai.request.JarDesignCompositionRequest;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.entity.ai.JarPhotoFrame;
import shop.esjh.memoryjar.enums.ai.*;
import shop.esjh.memoryjar.repository.ai.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 사진 배치의 검증·권한·오래된 탭 충돌·선택 변경·이미지 단독 전환을 외부 호출 없이 검증한다. */
class JarPhotoCompositionTest {
    private final JarDesignDraftRepository drafts = mock(JarDesignDraftRepository.class);
    private final JarAiGenerationRepository generations = mock(JarAiGenerationRepository.class);
    private final JarDesignCutoutPathCodec codec = mock(JarDesignCutoutPathCodec.class);
    private final JarDesignDraftService service = new JarDesignDraftService(drafts,generations,new AiDraftProperties(),codec);
    private static BigDecimal d(String v) { return new BigDecimal(v); }
    private static JarPhotoFrameValue frame() { return new JarPhotoFrameValue(d("0.1"),d("0.2"),d("0.7"),d("0.5")); }
    private JarDesignDraft active() {
        var draft = JarDesignDraft.builder().owner(User.builder().id(1L).build()).originalS3Key("original.png")
                .bodyStyle(JarBodyStyle.CAT).expiresAt(LocalDateTime.now(ZoneId.of("Asia/Seoul")).plusDays(1)).build();
        draft.selectOriginal(); when(drafts.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft)); return draft;
    }
    private JarDesignCompositionRequest request() { return new JarDesignCompositionRequest(JarBodyStyle.CAT,frame(),JarDraftDesignType.ORIGINAL,null,JarBodyStyle.CAT,null); }
    private void error(Runnable action, AiDraftErrorCode code) {
        assertThatThrownBy(action::run).isInstanceOf(ApiException.class).extracting(e -> ((ApiException)e).getErrorCode()).isEqualTo(code);
    }
    @Test void savesOnlyMetadataAndClearsOldSlotAndCutout() {
        var draft=active(); draft.updateSlot(d("0.5"),d("0.5"),d("0.2")); draft.updateCutoutPathJson("old");
        service.updateComposition(1L,10L,request());
        assertThat(draft.getPhotoFrame().toValue()).isEqualTo(frame()); assertThat(draft.getOriginalS3Key()).isEqualTo("original.png");
        assertThat(draft.getSlotCenterX()).isNull(); assertThat(draft.getCutoutPathJson()).isNull(); verifyNoInteractions(generations,codec);
    }
    @Test void imageOnlyKeepsOriginalAndSelectionButRemovesBodyAndFrame() {
        var draft=active(); service.updateComposition(1L,10L,request());
        service.updateComposition(1L,10L,new JarDesignCompositionRequest(null,null,JarDraftDesignType.ORIGINAL,null,JarBodyStyle.CAT,frame()));
        assertThat(draft.getBodyStyle()).isNull(); assertThat(draft.getPhotoFrame()).isNull();
        assertThat(draft.getSelectedDesignType()).isEqualTo(JarDraftDesignType.ORIGINAL); assertThat(draft.getOriginalS3Key()).isEqualTo("original.png");
    }
    @Test void rejectsNonOwnerExpiredAndMissingDraft() {
        var draft=active(); error(() -> service.updateComposition(2L,10L,request()),AiDraftErrorCode.DRAFT_NOT_OWNER);
        draft.markExpired(); error(() -> service.updateComposition(1L,10L,request()),AiDraftErrorCode.DRAFT_NOT_ACTIVE);
        error(() -> service.updateComposition(1L,11L,request()),AiDraftErrorCode.DRAFT_NOT_FOUND);
    }
    @Test void rejectsStaleSelectionBodyAndFraming() {
        var draft=active(); draft.selectAiGeneration(7L);
        error(() -> service.updateComposition(1L,10L,request()),AiDraftErrorCode.DRAFT_COMPOSITION_TARGET_CHANGED);
        draft.selectOriginal(); service.updateComposition(1L,10L,request());
        error(() -> service.updateComposition(1L,10L,request()),AiDraftErrorCode.DRAFT_COMPOSITION_TARGET_CHANGED);
        error(() -> service.updateComposition(1L,10L,new JarDesignCompositionRequest(null,null,JarDraftDesignType.ORIGINAL,null,JarBodyStyle.BEAR,frame())),AiDraftErrorCode.DRAFT_COMPOSITION_TARGET_CHANGED);
    }
    @Test void unchangedApplyDoesNotClearSlotAndCandidateChangeClearsFrame() {
        var draft=active(); service.updateComposition(1L,10L,request()); draft.updateSlot(d("0.5"),d("0.5"),d("0.2"));
        service.updateComposition(1L,10L,new JarDesignCompositionRequest(JarBodyStyle.CAT,frame(),JarDraftDesignType.ORIGINAL,null,JarBodyStyle.CAT,frame()));
        assertThat(draft.getSlotCenterX()).isEqualByComparingTo("0.5");
        draft.selectAiGeneration(7L); assertThat(draft.getPhotoFrame()).isNull(); assertThat(draft.getBodyStyle()).isEqualTo(JarBodyStyle.CAT);
        draft.updateComposition(JarBodyStyle.CAT,new JarPhotoFrame(frame())); draft.selectDefault(); assertThat(draft.getPhotoFrame()).isNull();
    }
    @Test void rejectsPartialPayloadAndInvalidRangesWithoutChangingDraft() {
        var draft=active();
        error(() -> service.updateComposition(1L,10L,new JarDesignCompositionRequest(null,frame(),JarDraftDesignType.ORIGINAL,null,JarBodyStyle.CAT,null)),AiDraftErrorCode.DRAFT_PHOTO_FRAME_INVALID);
        for (var invalid : new JarPhotoFrameValue[]{
            new JarPhotoFrameValue(null,d("0"),d("1"),d("1")),
            new JarPhotoFrameValue(d("-0.1"),d("0"),d("1"),d("1")),
            new JarPhotoFrameValue(d("0.5"),d("0"),d("1"),d("1")),
            new JarPhotoFrameValue(d("0"),d("0"),d("0"),d("1")),
            new JarPhotoFrameValue(d("0.0000001"),d("0"),d("0.5"),d("1"))})
            error(invalid::validate,AiDraftErrorCode.DRAFT_PHOTO_FRAME_INVALID);
        assertThat(draft.getPhotoFrame()).isNull();
    }
    @Test void decimalScaleDoesNotCreateFalseConcurrencyConflict() {
        var f = new JarPhotoFrameValue(d("0.100000"),d("0.200000"),d("0.700000"),d("0.500000"));
        assertThat(f).isEqualTo(frame());
    }
    @Test void wholeImageModeIsSavedAndParticipatesInConflictAndIdempotencyChecks() {
        var draft = active(); service.updateComposition(1L,10L,request());
        var whole = new JarPhotoFrameValue(d("0"),d("0.25"),d("1"),d("0.5"),JarPhotoFit.CONTAIN);
        service.updateComposition(1L,10L,new JarDesignCompositionRequest(JarBodyStyle.CAT,whole,JarDraftDesignType.ORIGINAL,null,JarBodyStyle.CAT,frame()));
        assertThat(draft.getPhotoFrame().toValue()).isEqualTo(whole);
        draft.updateSlot(d("0.5"),d("0.5"),d("0.2"));
        service.updateComposition(1L,10L,new JarDesignCompositionRequest(JarBodyStyle.CAT,whole,JarDraftDesignType.ORIGINAL,null,JarBodyStyle.CAT,whole));
        assertThat(draft.getSlotCenterX()).isNotNull();
        var staleCover = new JarPhotoFrameValue(whole.x(),whole.y(),whole.width(),whole.height());
        error(() -> service.updateComposition(1L,10L,new JarDesignCompositionRequest(JarBodyStyle.CAT,frame(),JarDraftDesignType.ORIGINAL,null,JarBodyStyle.CAT,staleCover)),AiDraftErrorCode.DRAFT_COMPOSITION_TARGET_CHANGED);
        assertThat(draft.getPhotoFrame().toValue()).isEqualTo(whole);
        assertThat(new JarPhotoFrameValue(d("0"),d("0"),d("1"),d("1"),null).fit()).isEqualTo(JarPhotoFit.COVER);
    }
}
