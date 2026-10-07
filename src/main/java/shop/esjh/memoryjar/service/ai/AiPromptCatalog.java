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

    private static final String BASE_V3 = "ai/prompts/base-v3.txt";

    private final Map<JarAiStyle, AiPromptDefinition> definitions;

    public AiPromptCatalog() {
        // 배경이 있는 원본은 장면 전체를 변환하고, 배경이 없는 그림의 빈 영역만 흰색으로 둔다.
        // 과거 후보는 재작성하지 않고 신규 요청의 버전 조합만 바꾼다.
        String base = readPrompt(BASE_V3);

        EnumMap<JarAiStyle, AiPromptDefinition> catalog = new EnumMap<>(JarAiStyle.class);
        catalog.put(JarAiStyle.CUTE_2D, definition(
                base, "ai/prompts/cute-2d-v2.txt", "BASE_V3+CUTE_2D_V2", null, null, null));
        // 기존 API·DB 스타일 ID는 유지하고 실제 생성 방식은 버전으로 구분한다.
        catalog.put(JarAiStyle.SOFT_25D, definition(
                base, "ai/prompts/soft-3d-v3.txt", "BASE_V3+SOFT_3D_V3", null, null, null));
        catalog.put(JarAiStyle.WATERCOLOR, definition(
                base, "ai/prompts/watercolor-v2.txt", "BASE_V3+WATERCOLOR_V2", null, null, null));
        catalog.put(JarAiStyle.HAND_DRAWN, definition(
                base, "ai/prompts/hand-drawn-v3.txt", "BASE_V3+HAND_DRAWN_V3", null, null, null));
        // 기괴는 비율 변형을 허용하는 전용 보존 규칙을 사용한다. BASE_V2의 변형 금지와 섞지 않는다.
        // 기존 API·DB의 WEIRDO ID와 과거 생성 버전은 유지한다.
        // V7도 공통 BASE를 합치지 않고 동일한 배경 정책만 포함해 강한 변형 규칙과 충돌을 피한다.
        catalog.put(JarAiStyle.WEIRDO, definition(
                readPrompt("ai/prompts/bizarre-v7.txt"), null, "BIZARRE_V7", null, null, null));
        // 아이콘 시트의 소재가 결과에 섞이지 않도록 신규 PIXEL에는 사용자 원본만 전송한다.
        // 과거 프롬프트·참조 리소스는 보관하고, 로컬 비교로 선택한 V3 후처리는 새 후보에만 기록한다.
        catalog.put(JarAiStyle.PIXEL, definition(
                base, "ai/prompts/pixel-v7.txt", "BASE_V3+PIXEL_V7",
                null, PixelPostProcessor.POSTPROCESS_VERSION, null));

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
     * 과거 버전 비교용 정의에는 사용 가능하지만 신규 PIXEL_V6는 Reference를 요청하지 않는다.
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
