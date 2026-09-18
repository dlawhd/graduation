package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Draft 원본 이미지의 실제 PNG·해상도·바이트 제한 검증을 확인한다.
 */
class DraftOriginalImageValidatorTest {

    private final DraftOriginalImageValidator validator = new DraftOriginalImageValidator(properties());

    @Test
    void validate_allowsDecoded480By480Png() throws Exception {
        assertThatCode(() -> validator.validate(imageBytes("png", 480, 480))).doesNotThrowAnyException();
    }

    @Test
    void validate_rejectsWrongImageFormatEvenWhenClientClaimsPng() throws Exception {
        assertThatThrownBy(() -> validator.validate(imageBytes("jpg", 480, 480)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void validate_rejectsWrongCanvasDimensions() throws Exception {
        assertThatThrownBy(() -> validator.validate(imageBytes("png", 481, 480)))
                .isInstanceOf(ResponseStatusException.class);
    }

    private AiDraftProperties properties() {
        AiDraftProperties properties = new AiDraftProperties();
        properties.setMaxOriginalImageSize(10L * 1024 * 1024);
        return properties;
    }

    private byte[] imageBytes(String format, int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, format, output);
        return output.toByteArray();
    }
}
