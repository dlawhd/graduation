package shop.esjh.memoryjar.repository.ai;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;
import shop.esjh.memoryjar.entity.ai.JarDesign;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.entity.ai.JarPhotoFrame;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.enums.ai.JarDesignType;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 V39 MariaDB와 JPA에서 원본 영역·사진 배치·본체 변경이 저장 후 다시 조회되는지 검증한다. */
@DataJpaTest
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class JarPhotoFrameRepositoryTest extends AbstractMariaDbRepositoryTest {
    @Test void wholeImageModeSurvivesDraftAndFinalDesignReload() {
        var owner = saveUser("whole-photo-owner", "whole-frame@example.com", "테스트");
        var photo = new JarPhotoFrameValue(BigDecimal.ZERO,new BigDecimal("0.25"),BigDecimal.ONE,new BigDecimal("0.5"),
                shop.esjh.memoryjar.enums.ai.JarPhotoFit.CONTAIN);
        var draft = JarDesignDraft.builder().owner(owner).originalS3Key("whole.png").bodyStyle(JarBodyStyle.PERFUME)
                .expiresAt(LocalDateTime.now().plusDays(1)).build();
        draft.selectOriginal(); draft.updateComposition(JarBodyStyle.PERFUME,new JarPhotoFrame(photo)); persist(draft);
        var jar = saveJar(owner,"전체 보기",LocalDateTime.now().plusDays(1));
        var design = persist(JarDesign.builder().jar(jar).designType(JarDesignType.ORIGINAL).finalS3Key("final-whole.png")
                .bodyStyle(JarBodyStyle.PERFUME).photoFrame(new JarPhotoFrame(photo)).slotCenterX(new BigDecimal("0.5"))
                .slotCenterY(new BigDecimal("0.3")).slotSizeRatio(new BigDecimal("0.2")).build());
        var draftId=draft.getDraftId(); var designId=design.getJarDesignId(); flushAndClear();
        assertThat(entityManager.find(JarDesignDraft.class,draftId).getPhotoFrame().toValue()).isEqualTo(photo);
        assertThat(entityManager.find(JarDesign.class,designId).getPhotoFrame().toValue()).isEqualTo(photo);
    }
    @Test
    void framingRoundTripsAndImageOnlyClearsCompositionWithoutChangingOriginal() {
        var owner = saveUser("photo-frame-owner", "frame@example.com", "테스트");
        var photo = frame("0.125", "0.25", "0.5", "0.5");
        var original = frame("0", "0.25", "1", "0.5");
        var draft = JarDesignDraft.builder().owner(owner).originalS3Key("original.png")
                .bodyStyle(JarBodyStyle.CAT).expiresAt(LocalDateTime.now().plusDays(1)).build();
        draft.selectOriginal();
        draft.setOriginalContentFrame(new JarPhotoFrame(original));
        draft.updateComposition(JarBodyStyle.ROCKET, new JarPhotoFrame(photo));
        persist(draft);
        var jar = saveJar(owner, "사진 배치", LocalDateTime.now().plusDays(1));
        var design = persist(JarDesign.builder().jar(jar).designType(JarDesignType.ORIGINAL)
                .finalS3Key("final.png").bodyStyle(JarBodyStyle.ROCKET).photoFrame(new JarPhotoFrame(photo))
                .slotCenterX(new BigDecimal("0.5")).slotCenterY(new BigDecimal("0.3"))
                .slotSizeRatio(new BigDecimal("0.2")).build());
        var draftId = draft.getDraftId();
        var designId = design.getJarDesignId();
        flushAndClear();

        var restored = entityManager.find(JarDesignDraft.class, draftId);
        assertThat(restored.getBodyStyle()).isEqualTo(JarBodyStyle.ROCKET);
        assertThat(restored.getPhotoFrame().toValue()).isEqualTo(photo);
        assertThat(restored.getOriginalContentFrame().toValue()).isEqualTo(original);
        assertThat(entityManager.find(JarDesign.class, designId).getPhotoFrame().toValue()).isEqualTo(photo);

        restored.updateComposition(null, null);
        flushAndClear();
        restored = entityManager.find(JarDesignDraft.class, draftId);
        assertThat(restored.getBodyStyle()).isNull();
        assertThat(restored.getPhotoFrame()).isNull();
        assertThat(restored.getOriginalS3Key()).isEqualTo("original.png");
        assertThat(restored.getOriginalContentFrame().toValue()).isEqualTo(original);
    }

    private JarPhotoFrameValue frame(String x, String y, String width, String height) {
        return new JarPhotoFrameValue(new BigDecimal(x), new BigDecimal(y), new BigDecimal(width), new BigDecimal(height));
    }
}
