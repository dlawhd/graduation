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
            assertThat(definition.promptVersion()).isNotBlank();
            assertThat(definition.prompt()).doesNotContain("$BASE_PROMPT", "@'");
        }
    }

    @Test
    @DisplayName("기괴는 전용 BIZARRE_V6를 사용하고 다른 스타일은 기존 공통 조합을 유지한다")
    void resolve_usesExpectedPromptCombinations() {
        assertThat(catalog.resolve(JarAiStyle.CUTE_2D).promptVersion()).isEqualTo("BASE_V2+CUTE_2D_V2");
        assertThat(catalog.resolve(JarAiStyle.SOFT_25D).promptVersion()).isEqualTo("BASE_V2+SOFT_3D_V2");
        assertThat(catalog.resolve(JarAiStyle.WATERCOLOR).promptVersion()).isEqualTo("BASE_V2+WATERCOLOR_V1");
        assertThat(catalog.resolve(JarAiStyle.HAND_DRAWN).promptVersion()).isEqualTo("BASE_V2+HAND_DRAWN_V1");
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).promptVersion())
                .isEqualTo("BIZARRE_V6");
        assertThat(catalog.resolve(JarAiStyle.PIXEL).promptVersion()).isEqualTo("BASE_V2+PIXEL_V6");
        for (JarAiStyle style : JarAiStyle.values()) {
            assertThat(catalog.resolve(style).prompt()).startsWith("Use input image 0 as the authoritative visual reference.");
        }
    }

    @Test
    @DisplayName("신규 PIXEL은 Reference 없이 기존 PIXEL_PP_V2 후처리를 유지한다")
    void resolve_pixelUsesNoReferenceAndKeepsPostprocess() {
        AiPromptCatalog.AiPromptDefinition definition = catalog.resolve(JarAiStyle.PIXEL);

        assertThat(definition.referenceImageVersion()).isNull();
        assertThat(definition.postprocessVersion()).isEqualTo("PIXEL_PP_V2");
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
        for (String path : new String[]{"pixel-v5.txt", "weirdo-v2.txt", "bizarre-v3.txt", "bizarre-v4.txt", "bizarre-v5.txt", "funny-universal-v1.txt", "funny-crazy-boost-v1.txt"}) {
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
    @DisplayName("기괴는 촬영·받침대·회색 배경 대신 흰 배경 일러스트를 지시한다")
    void resolve_bizarreRejectsPhotographicScene() {
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).prompt())
                .contains("pure white RGB 255,255,255", "NEVER a photograph, product shot",
                        "No floor, horizon, backdrop, cast shadow");
    }
}
