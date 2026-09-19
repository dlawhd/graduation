package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;

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
    @DisplayName("일반 스타일은 BASE와 스타일별 프롬프트를 함께 사용하고 WEIRDO와 PIXEL은 BASE를 사용하지 않는다")
    void resolve_usesExpectedPromptCombinations() {
        assertThat(catalog.resolve(JarAiStyle.CUTE_2D).promptVersion()).isEqualTo("BASE_V1+CUTE_2D_V1");
        assertThat(catalog.resolve(JarAiStyle.SOFT_25D).promptVersion()).isEqualTo("BASE_V1+SOFT_2_5D_V1");
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).promptVersion())
                .isEqualTo("FUNNY_UNIVERSAL_V1+FUNNY_CRAZY_BOOST_V1");
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).prompt()).doesNotContain("authoritative visual reference");
        assertThat(catalog.resolve(JarAiStyle.PIXEL).promptVersion()).isEqualTo("PIXEL_V5");
        assertThat(catalog.resolve(JarAiStyle.PIXEL).prompt()).doesNotContain("authoritative visual reference");
    }

    @Test
    @DisplayName("PIXEL은 480x480 고정 Reference와 후처리 버전을 사용한다")
    void resolve_pixelProvidesValidFixedReference() throws Exception {
        AiPromptCatalog.AiPromptDefinition definition = catalog.resolve(JarAiStyle.PIXEL);
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(catalog.loadReferenceImage(definition)));

        assertThat(definition.referenceImageVersion()).isEqualTo("PIXEL_REF_V1");
        assertThat(definition.postprocessVersion()).isEqualTo("PIXEL_PP_V1");
        assertThat(definition.referenceImageResourcePathOptional()).contains("ai/references/pixel-reference-v1.png");
        assertThat(image).isNotNull();
        assertThat(image.getWidth()).isEqualTo(480);
        assertThat(image.getHeight()).isEqualTo(480);
    }
}
