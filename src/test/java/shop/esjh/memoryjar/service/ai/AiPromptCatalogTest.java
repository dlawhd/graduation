package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import org.springframework.core.io.ClassPathResource;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 운영에서 사용할 AI 프롬프트와 Pixel Reference의 버전 조합이 바뀌지 않는지 검증한다.
 */
class AiPromptCatalogTest {

    private final AiPromptCatalog catalog = new AiPromptCatalog();

    @Test
    @DisplayName("모든 AI 스타일은 서버가 관리하는 비어 있지 않은 프롬프트와 버전을 가진다")
    void resolve_returnsFixedPromptForEveryStyle() {
        for (JarAiStyle style : JarAiStyle.values()) {
            AiPromptCatalog.AiPromptDefinition definition = catalog.resolve(style);

            assertThat(definition.prompt()).isNotBlank();
            assertThat(definition.promptVersion()).isNotBlank().hasSizeLessThanOrEqualTo(100);
            assertThat(definition.prompt()).doesNotContain("$BASE_PROMPT", "@'");
        }
    }

    @Test
    @DisplayName("모든 스타일은 배경 보존 정책의 새 버전을 사용하고 기괴는 독립 조합을 유지한다")
    void resolve_usesExpectedPromptCombinations() {
        assertThat(catalog.resolve(JarAiStyle.CUTE_2D).promptVersion()).isEqualTo("BASE_V3+CUTE_2D_V2");
        assertThat(catalog.resolve(JarAiStyle.SOFT_25D).promptVersion()).isEqualTo("BASE_V3+SOFT_3D_V3");
        assertThat(catalog.resolve(JarAiStyle.WATERCOLOR).promptVersion()).isEqualTo("BASE_V3+WATERCOLOR_V2");
        assertThat(catalog.resolve(JarAiStyle.HAND_DRAWN).promptVersion()).isEqualTo("BASE_V3+HAND_DRAWN_V3");
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).promptVersion())
                .isEqualTo("BIZARRE_V7");
        assertThat(catalog.resolve(JarAiStyle.PIXEL).promptVersion()).isEqualTo("BASE_V3+PIXEL_V7");
        for (JarAiStyle style : JarAiStyle.values()) {
            assertThat(catalog.resolve(style).prompt()).startsWith("Use input image 0 as the authoritative visual reference.");
        }
    }

    @Test
    @DisplayName("신규 PIXEL은 Reference 없이 96x96·64색 PIXEL_PP_V3 후처리를 사용한다")
    void resolve_pixelUsesNoReferenceAndV3Postprocess() {
        AiPromptCatalog.AiPromptDefinition definition = catalog.resolve(JarAiStyle.PIXEL);

        assertThat(definition.referenceImageVersion()).isNull();
        assertThat(definition.postprocessVersion()).isEqualTo("PIXEL_PP_V3");
        assertThat(definition.referenceImageResourcePathOptional()).isEmpty();
        assertThatThrownBy(() -> catalog.loadReferenceImage(definition)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @EnumSource(value = JarAiStyle.class, names = {"PIXEL", "WEIRDO"})
    @DisplayName("픽셀과 기괴는 대상 수·추상 선·정체성을 우선하고 과거 재발명 지시를 사용하지 않는다")
    void resolve_preservesSubjectsInsteadOfInventingCharacters(JarAiStyle style) {
        assertThat(catalog.resolve(style).prompt())
                .contains("source identity and subject count", "preserve its visible lines and shapes as abstract artwork")
                .doesNotContain("Use input image 1", "Create exactly one centered sprite",
                        "Do not faithfully redraw the original subject.", "Invent exactly one original character.",
                        "Push the exaggeration much further.");
    }

    @Test
    @DisplayName("기존 프롬프트와 480x480 Reference 리소스는 과거 버전 비교를 위해 보관한다")
    void legacyResources_remainAvailableForComparison() throws Exception {
        for (String path : new String[]{"base-v2.txt", "cute-2d-v2.txt", "soft-3d-v2.txt", "watercolor-v1.txt", "hand-drawn-v1.txt", "pixel-v6.txt", "bizarre-v6.txt", "pixel-v5.txt", "weirdo-v2.txt", "bizarre-v3.txt", "bizarre-v4.txt", "bizarre-v5.txt", "funny-universal-v1.txt", "funny-crazy-boost-v1.txt"}) {
            assertThat(new ClassPathResource("ai/prompts/" + path).exists()).isTrue();
        }
        var legacy = new AiPromptCatalog.AiPromptDefinition("legacy", "PIXEL_V5", "PIXEL_REF_V1",
                "PIXEL_PP_V2", "ai/references/pixel-reference-v1.png");
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(catalog.loadReferenceImage(legacy)));
        assertThat(image).isNotNull();
        assertThat(image.getWidth()).isEqualTo(480);
        assertThat(image.getHeight()).isEqualTo(480);
    }

    @Test
    @DisplayName("기괴는 기존 부분의 강한 변형을 허용하되 대상 교체와 없는 얼굴 추가를 금지한다")
    void resolve_bizarreHasIndependentDistortionRules() {
        var definition = catalog.resolve(JarAiStyle.WEIRDO);
        assertThat(definition.prompt())
                .contains("their contours stretch, sag, curl and fold back", "make one existing eye plane droop lower",
                        "Never replace people with creatures", "never add a face or turn an object into an animal")
                .doesNotContain("Keep overall body proportions", "Preserve their count, placement and expression.",
                        "The following style instructions change rendering only.");
        assertThat(definition.referenceImageVersion()).isNull();
        assertThat(definition.postprocessVersion()).isNull();
        assertThat(definition.referenceImageResourcePathOptional()).isEmpty();
    }

    @Test
    @DisplayName("기괴는 인물 간 색상 교환과 작은 식별 색상 누락을 명시적으로 금지한다")
    void resolve_bizarrePreservesLocalIdentityColors() {
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).prompt())
                .contains("Restyle each subject independently", "Do not swap those colors",
                        "each small colored accent in its original region", "keep it conspicuous and intact",
                        "Do not repaint everything as metal");
    }

    @Test
    @DisplayName("기괴는 사진이나 새 받침대가 아니라 원본 장면의 초현실적 일러스트를 지시한다")
    void resolve_bizarreRejectsPhotographicScene() {
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).prompt())
                .contains("NEVER a photograph, product shot", "Do not invent a floor, horizon, backdrop",
                        "Existing scene structures must remain recognizable",
                        "without erasing its recognizable layout")
                .doesNotContain("display stand or scene", "All empty space and background must remain pure white");
    }

    /** 모든 스타일에서 인물만 남기라는 예전 지시가 다시 섞이지 않도록 검사한다. */
    @ParameterizedTest
    @EnumSource(JarAiStyle.class)
    @DisplayName("배경이 있는 사진은 장면 전체를 같은 스타일로 변환한다")
    void resolve_preservesExistingBackground(JarAiStyle style) {
        assertThat(catalog.resolve(style).prompt())
                .contains("If input image 0 contains an existing scene",
                        "preserve and restyle that background together with the subjects",
                        "in the same requested style", "room geometry, windows, lights, furniture, landscape",
                        "perspective and relative placement", "Do not replace the scene with white",
                        "blur it away or extract only the foreground")
                .doesNotContain("centered on a plain white background", "Use a plain white background.",
                        "keep the background clean white or very light",
                        "Keep the surrounding background plain white or very light",
                        "isolated on pure white", "canvas contains ONLY the source subjects",
                        "No floor, horizon, backdrop", "No pedestal, display stand, backing plate, frame, scenery");
    }

    /** 흰색 그림판과 정사각형 합성 여백을 장소로 오해하지 않게 명시한다. */
    @ParameterizedTest
    @EnumSource(JarAiStyle.class)
    @DisplayName("배경 없는 그림은 흰색으로 두고 사진 바깥 여백에는 장면을 새로 만들지 않는다")
    void resolve_keepsAbsentBackgroundAndPaddingWhite(JarAiStyle style) {
        assertThat(catalog.resolve(style).prompt())
                .contains("If the source has no scene", "empty or transparent background pure white RGB 255,255,255",
                        "Do not invent a location, scenery, backdrop or decoration",
                        "Existing white padding outside a rectangular photo is canvas margin",
                        "Keep that padding white", "do not extend the scene into it",
                        "Preserve the source framing and subject scale",
                        "Preserve existing white surfaces and lighting within the scene");
    }

    @Test
    @DisplayName("픽셀은 배경 보존과 함께 기존 96x96 후처리에 맞춘 논리 격자를 안내한다")
    void resolve_pixelPromptMatchesExistingPostprocessGrid() {
        assertThat(catalog.resolve(JarAiStyle.PIXEL).prompt())
                .contains("96 by 96 logical pixel grid", "existing background as pixel art too")
                .doesNotContain("60 by 60");
    }
}
