package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.core.io.ClassPathResource;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 귀여운 2D와 손그림 비교 후보의 보존 규칙을 검사한다.
 * 후보는 테스트 리소스에만 두므로 실제 품질 확인 전 운영 프롬프트가 바뀌지 않는다.
 * 이 테스트는 외부 AI를 호출하지 않으며 생성 성공률이나 시각 품질을 보장하지 않는다.
 */
class AiPromptCandidateTest {
    private final AiPromptCatalog catalog = new AiPromptCatalog();

    /** 기존/개선 비교에서 표현 방식 이외의 원본 보존 조건이 빠지지 않는지 확인한다. */
    @ParameterizedTest
    @CsvSource({
            "CUTE_2D, cute-2d-v3.txt, flat 2D illustration, gentle linework",
            "HAND_DRAWN, hand-drawn-v2.txt, colored-pencil illustration, fine directional strokes"
    })
    @DisplayName("비교 후보는 짧은 독립 프롬프트에서도 스타일과 원본 보존 조건을 유지한다")
    void candidates_keepStyleAndPreservationRules(JarAiStyle style, String file,
                                                 String rendering, String texture) throws IOException {
        String candidate = read("ai/prompt-candidates/" + file);
        assertThat(candidate).startsWith("Use input image 0 as the authoritative visual reference.")
                .contains(rendering, texture, "every source subject", "identity", "relative size",
                        "position", "pose", "viewing direction", "silhouette", "relationships",
                        "facial features", "expressions", "markings", "anatomy stays unchanged",
                        "abstract or unfinished", "monochrome", "intentional white regions white",
                        "open strokes, gaps and separate parts", "centered and uncropped",
                        "plain white background", "1024 by 1024", "coin slot")
                .doesNotContain("$BASE_PROMPT", "Use input image 1");
        assertThat(candidate.length()).isLessThan(1800).isLessThan(catalog.resolve(style).prompt().length());
        assertThat(new ClassPathResource("ai/prompts/" + file).exists()).isFalse();
    }

    /** 실패 원인과 실제 품질을 확인하기 전 두 운영 조합은 기존 버전 그대로 둔다. */
    @Test
    @DisplayName("귀여운 2D와 손그림 비교 후보가 운영 매핑에 자동 적용되지 않는다")
    void productionMappings_remainUnchangedUntilComparison() throws IOException {
        assertThat(catalog.resolve(JarAiStyle.CUTE_2D).promptVersion()).isEqualTo("BASE_V2+CUTE_2D_V2");
        assertThat(catalog.resolve(JarAiStyle.HAND_DRAWN).promptVersion()).isEqualTo("BASE_V2+HAND_DRAWN_V1");
        assertThat(catalog.resolve(JarAiStyle.CUTE_2D).prompt())
                .isEqualTo(combined("cute-2d-v2.txt"));
        assertThat(catalog.resolve(JarAiStyle.HAND_DRAWN).prompt())
                .isEqualTo(combined("hand-drawn-v1.txt"));
    }

    /** 공통 BASE를 수정해 다른 스타일이나 픽셀 후처리에 영향을 주지 않도록 확인한다. */
    @Test
    @DisplayName("기괴와 성공한 세 스타일은 기존 리소스와 버전을 사용한다")
    void excludedStyles_keepTheirExistingDefinitions() throws IOException {
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).prompt()).isEqualTo(read("ai/prompts/bizarre-v6.txt"));
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).promptVersion()).isEqualTo("BIZARRE_V6");
        assertThat(catalog.resolve(JarAiStyle.SOFT_25D).prompt()).isEqualTo(combined("soft-3d-v2.txt"));
        assertThat(catalog.resolve(JarAiStyle.SOFT_25D).promptVersion()).isEqualTo("BASE_V2+SOFT_3D_V2");
        assertThat(catalog.resolve(JarAiStyle.WATERCOLOR).prompt()).isEqualTo(combined("watercolor-v1.txt"));
        assertThat(catalog.resolve(JarAiStyle.WATERCOLOR).promptVersion()).isEqualTo("BASE_V2+WATERCOLOR_V1");
        assertThat(catalog.resolve(JarAiStyle.PIXEL).prompt()).isEqualTo(combined("pixel-v6.txt"));
        assertThat(catalog.resolve(JarAiStyle.PIXEL).promptVersion()).isEqualTo("BASE_V2+PIXEL_V6");
        assertThat(catalog.resolve(JarAiStyle.PIXEL).postprocessVersion()).isEqualTo("PIXEL_PP_V3");
        for (JarAiStyle style : JarAiStyle.values()) {
            assertThat(catalog.resolve(style).referenceImageVersion()).isNull();
        }
    }

    private String combined(String styleFile) throws IOException {
        return read("ai/prompts/base-v2.txt") + System.lineSeparator() + System.lineSeparator()
                + read("ai/prompts/" + styleFile);
    }

    private String read(String path) throws IOException {
        try (var stream = new ClassPathResource(path).getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8).trim();
        }
    }
}
