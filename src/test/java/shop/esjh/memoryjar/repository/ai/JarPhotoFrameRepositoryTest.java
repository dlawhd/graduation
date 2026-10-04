package shop.esjh.memoryjar.repository.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
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
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
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
    /** 새 입구 문자열도 기존 좌표와 함께 DB에 저장하고 그대로 다시 읽는다. */
    @ParameterizedTest
    @EnumSource(JarSlotStyle.class)
    void everySlotStyleRoundTripsWithUnchangedPosition(JarSlotStyle style) {
        var owner=saveUser("slot-owner","slot-frame@example.com","테스트");
        var draft=JarDesignDraft.builder().owner(owner).originalS3Key("slot.png").bodyStyle(JarBodyStyle.CAT)
                .expiresAt(LocalDateTime.now().plusDays(1)).build();
        draft.selectOriginal(); draft.updateSlot(new BigDecimal("0.31"),new BigDecimal("0.72"),new BigDecimal("0.3"));
        draft.updateSlotStyle(style); persist(draft);
        var jar=saveJar(owner,"입구 저장",LocalDateTime.now().plusDays(1));
        var design=persist(JarDesign.builder().jar(jar).designType(JarDesignType.ORIGINAL).finalS3Key("slot-final.png")
                .bodyStyle(JarBodyStyle.CAT).slotStyle(style).slotCenterX(new BigDecimal("0.31"))
                .slotCenterY(new BigDecimal("0.72")).slotSizeRatio(new BigDecimal("0.3")).build());
        var draftId=draft.getDraftId(); var designId=design.getJarDesignId(); flushAndClear();
        assertThat(entityManager.find(JarDesignDraft.class,draftId).getSlotStyle()).isEqualTo(style);
        var restored=entityManager.find(JarDesign.class,designId);
        assertThat(restored.getSlotStyle()).isEqualTo(style);
        assertThat(restored.getSlotCenterX()).isEqualByComparingTo("0.31");
        assertThat(restored.getSlotCenterY()).isEqualByComparingTo("0.72");
        assertThat(restored.getSlotSizeRatio()).isEqualByComparingTo("0.3");
    }
    /** 새 동물도 enum 문자열·전체 보기·입구를 Draft와 최종 Design에서 그대로 재조회해야 한다. */
    @ParameterizedTest
    @EnumSource(value=JarBodyStyle.class,names={"SHIBA","CORGI","FOX","RACCOON","KOALA","RED_PANDA","OTTER","SEAL","HAMSTER","HEDGEHOG",
            "SQUIRREL","DEER","OWL","CHICK","DUCK","TURTLE","FROG","AXOLOTL","ELEPHANT","CAPYBARA"})
    void newAnimalRoundTripsWithPhotoAndSlot(JarBodyStyle body) {
        var owner=saveUser("animal-owner","animal-frame@example.com","테스트");
        var photo=new JarPhotoFrameValue(BigDecimal.ZERO,new BigDecimal("0.25"),BigDecimal.ONE,new BigDecimal("0.5"),
                shop.esjh.memoryjar.enums.ai.JarPhotoFit.CONTAIN);
        var draft=JarDesignDraft.builder().owner(owner).originalS3Key("animal.png").bodyStyle(body)
                .expiresAt(LocalDateTime.now().plusDays(1)).build();
        draft.selectOriginal(); draft.updateComposition(body,new JarPhotoFrame(photo)); persist(draft);
        var jar=saveJar(owner,"동물 저장",LocalDateTime.now().plusDays(1));
        var design=persist(JarDesign.builder().jar(jar).designType(JarDesignType.ORIGINAL).finalS3Key("animal-final.png")
                .bodyStyle(body).photoFrame(new JarPhotoFrame(photo)).slotCenterX(new BigDecimal("0.3"))
                .slotCenterY(new BigDecimal("0.4")).slotSizeRatio(new BigDecimal("0.2")).build());
        var draftId=draft.getDraftId(); var designId=design.getJarDesignId(); flushAndClear();
        assertThat(entityManager.find(JarDesignDraft.class,draftId).getBodyStyle()).isEqualTo(body);
        var restored=entityManager.find(JarDesign.class,designId);
        assertThat(restored.getBodyStyle()).isEqualTo(body); assertThat(restored.getPhotoFrame().toValue()).isEqualTo(photo);
        assertThat(restored.getSlotCenterX()).isEqualByComparingTo("0.3");
        assertThat(restored.getSlotCenterY()).isEqualByComparingTo("0.4");
    }
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
        assertThat(restored.getAiInputPhotoFrame().toValue()).isEqualTo(photo);
        assertThat(restored.getOriginalContentFrame().toValue()).isEqualTo(original);
        assertThat(entityManager.find(JarDesign.class, designId).getPhotoFrame().toValue()).isEqualTo(photo);

        restored.updateComposition(null, null);
        flushAndClear();
        restored = entityManager.find(JarDesignDraft.class, draftId);
        assertThat(restored.getBodyStyle()).isNull();
        assertThat(restored.getPhotoFrame()).isNull();
        assertThat(restored.getAiInputPhotoFrame()).isNull();
        assertThat(restored.getOriginalS3Key()).isEqualTo("original.png");
        assertThat(restored.getOriginalContentFrame().toValue()).isEqualTo(original);
    }

    private JarPhotoFrameValue frame(String x, String y, String width, String height) {
        return new JarPhotoFrameValue(new BigDecimal(x), new BigDecimal(y), new BigDecimal(width), new BigDecimal(height));
    }
}
