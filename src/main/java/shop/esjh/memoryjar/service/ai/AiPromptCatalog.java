package shop.esjh.memoryjar.service.ai;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;

/**
 * AI 스타일별로 변경 불가능한 프롬프트 리소스와 재현용 버전 정보를 제공한다.
 * 클라이언트가 프롬프트나 버전을 지정하지 못하도록 서버가 이 Catalog만 사용한다.
 */
@Component
public class AiPromptCatalog {

    private static final String BASE_V1 = "ai/prompts/base-v1.txt";
    private static final String PIXEL_REFERENCE_V1 = "ai/references/pixel-reference-v1.png";

    private final Map<JarAiStyle, AiPromptDefinition> definitions;

    public AiPromptCatalog() {
        String base = readPrompt(BASE_V1);

        EnumMap<JarAiStyle, AiPromptDefinition> catalog = new EnumMap<>(JarAiStyle.class);
        catalog.put(JarAiStyle.CUTE_2D, definition(
                base, "ai/prompts/cute-2d-v1.txt", "BASE_V1+CUTE_2D_V1", null, null, null));
        catalog.put(JarAiStyle.SOFT_25D, definition(
                base, "ai/prompts/soft-2-5d-v1.txt", "BASE_V1+SOFT_2_5D_V1", null, null, null));
        catalog.put(JarAiStyle.WATERCOLOR, definition(
                base, "ai/prompts/watercolor-v1.txt", "BASE_V1+WATERCOLOR_V1", null, null, null));
        catalog.put(JarAiStyle.HAND_DRAWN, definition(
                base, "ai/prompts/hand-drawn-v1.txt", "BASE_V1+HAND_DRAWN_V1", null, null, null));
        catalog.put(JarAiStyle.WEIRDO, definition(
                readPrompt("ai/prompts/funny-universal-v1.txt"),
                "ai/prompts/funny-crazy-boost-v1.txt", "FUNNY_UNIVERSAL_V1+FUNNY_CRAZY_BOOST_V1", null, null, null));
        catalog.put(JarAiStyle.PIXEL, definition(
                readPrompt("ai/prompts/pixel-v5.txt"), null, "PIXEL_V5",
                "PIXEL_REF_V1", PixelPostProcessor.POSTPROCESS_VERSION, PIXEL_REFERENCE_V1));

        this.definitions = Map.copyOf(catalog);
    }

    /**
     * 선택한 스타일에 맞는 실제 프롬프트와 DB 이력용 버전 정보를 반환한다.
     */
    public AiPromptDefinition resolve(JarAiStyle style) {
        AiPromptDefinition definition = definitions.get(style);
        if (definition == null) {
            throw new IllegalArgumentException("지원하지 않는 AI 스타일입니다: " + style);
        }
        return definition;
    }

    /**
     * PIXEL 생성에서만 사용하는 고정 Reference 이미지를 읽는다.
     */
    public byte[] loadReferenceImage(AiPromptDefinition definition) {
        String resourcePath = definition.referenceImageResourcePath();
        if (resourcePath == null) {
            throw new IllegalArgumentException("이 스타일은 Reference 이미지를 사용하지 않습니다.");
        }

        try (InputStream inputStream = new ClassPathResource(resourcePath).getInputStream()) {
            return inputStream.readAllBytes();
        } catch (IOException exception) {
            throw new IllegalStateException("AI Reference 리소스를 읽을 수 없습니다: " + resourcePath, exception);
        }
    }

    private AiPromptDefinition definition(String firstPrompt, String secondPromptPath, String promptVersion,
                                          String referenceImageVersion, String postprocessVersion,
                                          String referenceImageResourcePath) {
        String prompt = secondPromptPath == null
                ? firstPrompt
                : firstPrompt + System.lineSeparator() + System.lineSeparator() + readPrompt(secondPromptPath);
        return new AiPromptDefinition(prompt, promptVersion, referenceImageVersion,
                postprocessVersion, referenceImageResourcePath);
    }

    private String readPrompt(String resourcePath) {
        Resource resource = new ClassPathResource(resourcePath);
        try (InputStream inputStream = resource.getInputStream()) {
            String prompt = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8).trim();
            if (prompt.isBlank()) {
                throw new IllegalStateException("AI 프롬프트 리소스가 비어 있습니다: " + resourcePath);
            }
            return prompt;
        } catch (IOException exception) {
            throw new IllegalStateException("AI 프롬프트 리소스를 읽을 수 없습니다: " + resourcePath, exception);
        }
    }

    /**
     * 한 Generation을 재현하는 데 필요한 고정 리소스 정보다.
     */
    public record AiPromptDefinition(
            String prompt,
            String promptVersion,
            String referenceImageVersion,
            String postprocessVersion,
            String referenceImageResourcePath
    ) {
        public Optional<String> referenceImageResourcePathOptional() {
            return Optional.ofNullable(referenceImageResourcePath);
        }
    }
}
