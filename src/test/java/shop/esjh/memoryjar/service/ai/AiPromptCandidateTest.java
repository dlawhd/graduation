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
 * 후보는 테스트 리소스에만 두며, 배경 보존을 위한 새 운영 버전과도 별도로 보관한다.
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

    /** 배경 보존 변경에도 과거의 짧은 비교 후보가 운영에 자동 적용되지 않게 한다. */
    @Test
    @DisplayName("귀여운 2D와 손그림 비교 후보가 운영 매핑에 자동 적용되지 않는다")
    void productionMappings_remainUnchangedUntilComparison() throws IOException {
        assertThat(catalog.resolve(JarAiStyle.CUTE_2D).promptVersion()).isEqualTo("BASE_V3+CUTE_2D_V2");
        assertThat(catalog.resolve(JarAiStyle.HAND_DRAWN).promptVersion()).isEqualTo("BASE_V3+HAND_DRAWN_V3");
        assertThat(catalog.resolve(JarAiStyle.CUTE_2D).prompt())
                .isEqualTo(combined("cute-2d-v2.txt"));
        assertThat(catalog.resolve(JarAiStyle.HAND_DRAWN).prompt())
                .isEqualTo(combined("hand-drawn-v3.txt"))
                .isNotEqualTo(read("ai/prompt-candidates/hand-drawn-v2.txt"));
        assertThat(catalog.resolve(JarAiStyle.CUTE_2D).prompt())
                .isNotEqualTo(read("ai/prompt-candidates/cute-2d-v3.txt"));
    }

    /** 배경 지시가 있는 스타일은 새 버전을 사용하되 픽셀 후처리와 참조 정책은 유지한다. */
    @Test
    @DisplayName("새 배경 보존 버전에도 픽셀 후처리와 참조 없음 정책은 유지한다")
    void backgroundVersions_keepPostprocessAndReferencePolicy() throws IOException {
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).prompt()).isEqualTo(read("ai/prompts/bizarre-v7.txt"));
        assertThat(catalog.resolve(JarAiStyle.WEIRDO).promptVersion()).isEqualTo("BIZARRE_V7");
        assertThat(catalog.resolve(JarAiStyle.SOFT_25D).prompt()).isEqualTo(combined("soft-3d-v3.txt"));
        assertThat(catalog.resolve(JarAiStyle.SOFT_25D).promptVersion()).isEqualTo("BASE_V3+SOFT_3D_V3");
        assertThat(catalog.resolve(JarAiStyle.WATERCOLOR).prompt()).isEqualTo(combined("watercolor-v2.txt"));
        assertThat(catalog.resolve(JarAiStyle.WATERCOLOR).promptVersion()).isEqualTo("BASE_V3+WATERCOLOR_V2");
        assertThat(catalog.resolve(JarAiStyle.PIXEL).prompt()).isEqualTo(combined("pixel-v7.txt"));
        assertThat(catalog.resolve(JarAiStyle.PIXEL).promptVersion()).isEqualTo("BASE_V3+PIXEL_V7");
        assertThat(catalog.resolve(JarAiStyle.PIXEL).postprocessVersion()).isEqualTo("PIXEL_PP_V3");
        for (JarAiStyle style : JarAiStyle.values()) {
            assertThat(catalog.resolve(style).referenceImageVersion()).isNull();
        }
    }

    private String combined(String styleFile) throws IOException {
        return read("ai/prompts/base-v3.txt") + System.lineSeparator() + System.lineSeparator()
                + read("ai/prompts/" + styleFile);
    }

    private String read(String path) throws IOException {
        try (var stream = new ClassPathResource(path).getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8).trim();
        }
    }
}
