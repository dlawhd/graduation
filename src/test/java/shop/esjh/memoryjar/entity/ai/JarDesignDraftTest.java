package shop.esjh.memoryjar.entity.ai;

import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Draft 선택 변경 시 이전 Slot과 후보 ID가 남지 않는지 확인한다.
 */
class JarDesignDraftTest {

    @Test void originalCropSurvivesAiSelectionAndAiReframingButImageOnlyClearsIt() {
        var draft=JarDesignDraft.builder().originalS3Key("original.png").bodyStyle(shop.esjh.memoryjar.enums.ai.JarBodyStyle.CAT)
            .expiresAt(LocalDateTime.now().plusDays(1)).build();
        var original=new JarPhotoFrame(new shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue(new BigDecimal(".2"),new BigDecimal(".3"),new BigDecimal(".5"),new BigDecimal(".4")));
        var generated=new JarPhotoFrame(new shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue(BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ONE,BigDecimal.ONE));
        draft.selectOriginal();draft.updateComposition(draft.getBodyStyle(),original);
        draft.selectAiGeneration(10L);
        assertThat(draft.getPhotoFrame()).isNull();
        assertThat(draft.getAiInputPhotoFrame()).isSameAs(original);
        draft.updateComposition(draft.getBodyStyle(),generated);
        assertThat(draft.getAiInputPhotoFrame()).isSameAs(original);
        draft.selectOriginal();
        assertThat(draft.getPhotoFrame()).isSameAs(original);
        draft.updateComposition(null,null);
        assertThat(draft.getAiInputPhotoFrame()).isNull();
        assertThat(draft.getOriginalS3Key()).isEqualTo("original.png");
    }

    @Test
    void selectDefault_clearsAiCandidateAndSlot() {
        JarDesignDraft draft = JarDesignDraft.builder()
                .originalS3Key("jar-design-drafts/originals/test.png")
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build();
        draft.selectAiGeneration(10L);
        draft.updateSlotStyle(JarSlotStyle.WOOD);
        draft.updateSlot(new BigDecimal("0.5"), new BigDecimal("0.4"), new BigDecimal("0.3"));

        draft.selectDefault();

        assertThat(draft.getSelectedGenerationId()).isNull();
        assertThat(draft.getSlotCenterX()).isNull();
        assertThat(draft.getSlotCenterY()).isNull();
        assertThat(draft.getSlotSizeRatio()).isNull();
        assertThat(draft.getSlotStyle()).isEqualTo(JarSlotStyle.CAPSULE);
        assertThat(draft.hasCustomDesignSelection()).isFalse();
    }

    @Test
    void changingFromAiToOriginal_clearsPreviousSlot() {
        JarDesignDraft draft = JarDesignDraft.builder()
                .originalS3Key("jar-design-drafts/originals/test.png")
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build();
        draft.selectAiGeneration(10L);
        draft.updateSlot(new BigDecimal("0.5"), new BigDecimal("0.4"), new BigDecimal("0.3"));

        draft.selectOriginal();

        assertThat(draft.getSelectedGenerationId()).isNull();
        assertThat(draft.getSlotCenterX()).isNull();
        assertThat(draft.hasCustomDesignSelection()).isTrue();
    }

    @Test
    void terminalDraft_canRecordOriginalS3DeletionOnlyOnce() {
        JarDesignDraft draft = JarDesignDraft.builder()
                .originalS3Key("jar-design-drafts/originals/test.png")
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build();
        LocalDateTime deletedAt = LocalDateTime.now();

        draft.markExpired();
        draft.markOriginalS3Deleted(deletedAt);

        assertThat(draft.getOriginalS3DeletedAt()).isEqualTo(deletedAt);
        assertThatThrownBy(() -> draft.markOriginalS3Deleted(deletedAt.plusSeconds(1)))
                .isInstanceOf(IllegalStateException.class);
    }
}
