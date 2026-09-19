package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.config.properties.AiGenerationImageProperties;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Cloudflare 후보 이미지를 1024×1024 PNG 계약으로 저장할 수 있는지 검증한다.
 */
class GeneratedAiImageValidatorTest {

    private final GeneratedAiImageValidator validator = new GeneratedAiImageValidator(properties());

    @Test
    void validateAndNormalize_accepts1024Png() throws Exception {
        byte[] normalized = validator.validateAndNormalize(imageBytes("png", 1024, 1024));
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(normalized));

        assertThat(image).isNotNull();
        assertThat(image.getWidth()).isEqualTo(1024);
        assertThat(image.getHeight()).isEqualTo(1024);
        assertThat(isPng(normalized)).isTrue();
    }

    @Test
    void validateAndNormalize_accepts1024JpegAndStoresPng() throws Exception {
        byte[] normalized = validator.validateAndNormalize(imageBytes("jpg", 1024, 1024));

        assertThat(isPng(normalized)).isTrue();
    }

    @Test
    void validateAndNormalize_rejectsNonSquareOrUnexpectedSize() throws Exception {
        assertThatThrownBy(() -> validator.validateAndNormalize(imageBytes("png", 1024, 768)))
                .isInstanceOf(GeneratedAiImageValidator.InvalidGeneratedAiImageException.class);
    }

    @Test
    void validateAndNormalize_rejectsUnsupportedOrAnimatedFormat() throws Exception {
        assertThatThrownBy(() -> validator.validateAndNormalize(imageBytes("gif", 1024, 1024)))
                .isInstanceOf(GeneratedAiImageValidator.InvalidGeneratedAiImageException.class);
    }

    @Test
    void validateAndNormalize_decodesWebpBeforeApplying1024By1024Contract() {
        // 정적 1×1 WebP fixture: WebP 디코더 경로를 통과한 뒤 크기 계약에서 거절되어야 한다.
        byte[] webp = Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");

        assertThatThrownBy(() -> validator.validateAndNormalize(webp))
                .isInstanceOf(GeneratedAiImageValidator.InvalidGeneratedAiImageException.class)
                .hasMessageContaining("1024×1024");
    }

    @Test
    void validateAndNormalize_rejectsOversizedRawResponseBeforeDecoding() {
        AiGenerationImageProperties strictProperties = properties();
        strictProperties.setMaxGeneratedImageSize(2);
        GeneratedAiImageValidator strictValidator = new GeneratedAiImageValidator(strictProperties);

        assertThatThrownBy(() -> strictValidator.validateAndNormalize(new byte[]{1, 2, 3}))
                .isInstanceOf(GeneratedAiImageValidator.InvalidGeneratedAiImageException.class);
    }

    private AiGenerationImageProperties properties() {
        AiGenerationImageProperties properties = new AiGenerationImageProperties();
        properties.setMaxGeneratedImageSize(10L * 1024 * 1024);
        properties.setRequiredGeneratedImageWidth(1024);
        properties.setRequiredGeneratedImageHeight(1024);
        return properties;
    }

    private byte[] imageBytes(String format, int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, format, output);
        return output.toByteArray();
    }

    private boolean isPng(byte[] bytes) {
        return bytes.length >= 8
                && bytes[0] == (byte) 0x89
                && bytes[1] == 0x50
                && bytes[2] == 0x4E
                && bytes[3] == 0x47;
    }
}
