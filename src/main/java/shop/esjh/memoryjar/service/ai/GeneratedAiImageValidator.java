package shop.esjh.memoryjar.service.ai;

import org.springframework.stereotype.Component;
import shop.esjh.memoryjar.config.properties.AiGenerationImageProperties;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

/**
 * Cloudflare 응답 이미지를 실제 바이트로 검증하고, 안전한 PNG 후보 이미지로 정규화한다.
 * 일반 AI 후보는 품질을 임의로 바꾸지 않기 위해 정확히 1024×1024일 때만 허용한다.
 */
@Component
public class GeneratedAiImageValidator {

    private static final Set<String> ALLOWED_FORMATS = Set.of("png", "jpeg", "webp");

    private final AiGenerationImageProperties properties;

    public GeneratedAiImageValidator(AiGenerationImageProperties properties) {
        this.properties = properties;
    }

    /**
     * 단일 프레임 PNG/JPEG/WebP 결과가 정해진 1024×1024 규격인지 확인하고 PNG로 재인코딩한다.
     */
    public byte[] validateAndNormalize(byte[] imageBytes) {
        if (imageBytes == null || imageBytes.length == 0) {
            throw invalidResult("AI 응답에 이미지 바이트가 없습니다.");
        }
        if (imageBytes.length > properties.getMaxGeneratedImageSize()) {
            throw invalidResult("AI 응답 이미지가 허용 크기를 초과했습니다.");
        }

        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(imageBytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw invalidResult("AI 응답 이미지 형식을 식별할 수 없습니다.");
            }

            ImageReader reader = readers.next();
            try {
                // GIF·animated WebP처럼 여러 프레임을 담은 결과는 후보 이미지로 저장하지 않는다.
                reader.setInput(input, false, true);
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!ALLOWED_FORMATS.contains(format) || reader.getNumImages(true) != 1) {
                    throw invalidResult("AI 응답은 PNG, JPEG, WebP 단일 프레임 이미지여야 합니다.");
                }

                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width != properties.getRequiredGeneratedImageWidth()
                        || height != properties.getRequiredGeneratedImageHeight()) {
                    throw invalidResult("AI 응답 이미지가 "
                            + properties.getRequiredGeneratedImageWidth() + "×"
                            + properties.getRequiredGeneratedImageHeight() + " 규격이 아닙니다.");
                }

                BufferedImage decoded = reader.read(0);
                if (decoded == null) {
                    throw invalidResult("AI 응답 이미지를 디코딩할 수 없습니다.");
                }
                return writePng(decoded);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof InvalidGeneratedAiImageException invalidGeneratedAiImageException) {
                throw invalidGeneratedAiImageException;
            }
            throw invalidResult("AI 응답 이미지가 손상되었습니다.", exception);
        }
    }

    private byte[] writePng(BufferedImage image) throws IOException {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, "png", output)) {
                throw invalidResult("AI 응답 이미지를 PNG로 변환할 수 없습니다.");
            }
            byte[] normalized = output.toByteArray();
            if (normalized.length > properties.getMaxGeneratedImageSize()) {
                throw invalidResult("정규화된 AI 후보 이미지가 허용 크기를 초과했습니다.");
            }
            return normalized;
        }
    }

    private InvalidGeneratedAiImageException invalidResult(String message) {
        return new InvalidGeneratedAiImageException(message);
    }

    private InvalidGeneratedAiImageException invalidResult(String message, Throwable cause) {
        return new InvalidGeneratedAiImageException(message, cause);
    }

    /** Generation Service가 PROVIDER_INVALID_RESPONSE로 상태를 기록할 수 있는 검증 실패다. */
    public static class InvalidGeneratedAiImageException extends RuntimeException {
        public InvalidGeneratedAiImageException(String message) {
            super(message);
        }

        public InvalidGeneratedAiImageException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
