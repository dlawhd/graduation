package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.Iterator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 외부 원본 이미지의 실제 형식·단일 프레임·정규화·바이트 제한을 확인한다.
 */
class DraftOriginalImageValidatorTest {

    private final DraftOriginalImageValidator validator = new DraftOriginalImageValidator(properties());

    @Test
    void normalize_keepsCanvasPngAs480By480Png() throws Exception {
        BufferedImage normalized = decode(validator.normalize(imageBytes("png", 480, 480)));

        assertThat(normalized.getWidth()).isEqualTo(480);
        assertThat(normalized.getHeight()).isEqualTo(480);
    }

    @Test
    void normalize_acceptsJpegAndCentersItOnWhiteCanvas() throws Exception {
        BufferedImage source = new BufferedImage(400, 200, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < source.getHeight(); y++) {
            for (int x = 0; x < source.getWidth(); x++) {
                source.setRGB(x, y, 0xFFFF0000);
            }
        }

        BufferedImage normalized = decode(validator.normalize(write(source, "jpg")));

        assertThat(normalized.getWidth()).isEqualTo(480);
        assertThat(normalized.getHeight()).isEqualTo(480);
        assertThat(normalized.getRGB(240, 240) & 0x00FF0000).isGreaterThan(0x00CC0000);
        assertThat(normalized.getRGB(240, 0) & 0x00FFFFFF).isEqualTo(0x00FFFFFF);
    }

    @Test
    void normalize_rejectsUnsupportedOrAnimatedFormat() throws Exception {
        assertThatThrownBy(() -> validator.normalize(imageBytes("gif", 480, 480)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void normalize_rejectsExcessiveSourceDimensionBeforeFullDecode() throws Exception {
        assertThatThrownBy(() -> validator.normalize(imageBytes("png", 4097, 1)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void normalize_appliesJpegExifOrientationBeforeCentering() throws Exception {
        BufferedImage source = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < source.getHeight(); y++) {
            for (int x = 0; x < source.getWidth(); x++) {
                source.setRGB(x, y, 0xFFFF0000);
            }
        }

        BufferedImage normalized = decode(validator.normalize(withExifOrientation(write(source, "jpg"), 6)));

        // EXIF 6은 90도 시계 방향 회전이다. 따라서 세로 이미지가 되어 좌우에 흰 여백이 생긴다.
        assertThat(normalized.getRGB(0, 240) & 0x00FFFFFF).isEqualTo(0x00FFFFFF);
        assertThat(normalized.getRGB(240, 0) & 0x00FF0000).isGreaterThan(0x00CC0000);
    }

    @Test
    void webpImageReader_isRegisteredForServerSideByteValidation() {
        Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName("webp");

        assertThat(readers.hasNext()).isTrue();
    }

    @Test
    void normalize_acceptsActualWebpBytesAndConvertsThemToPng() throws Exception {
        // 정적 1×1 WebP fixture: 확장자나 Content-Type이 아니라 실제 WebP 디코더 경로를 검증한다.
        byte[] webp = Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");

        BufferedImage normalized = decode(validator.normalize(webp));

        assertThat(normalized.getWidth()).isEqualTo(480);
        assertThat(normalized.getHeight()).isEqualTo(480);
    }

    private AiDraftProperties properties() {
        AiDraftProperties properties = new AiDraftProperties();
        properties.setMaxOriginalImageSize(10L * 1024 * 1024);
        properties.setMaxOriginalImageDimension(4096);
        properties.setMaxOriginalImagePixels(16L * 1024 * 1024);
        return properties;
    }

    private byte[] imageBytes(String format, int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        return write(image, format);
    }

    private byte[] write(BufferedImage image, String format) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, format, output);
        return output.toByteArray();
    }

    private BufferedImage decode(byte[] imageBytes) throws Exception {
        return ImageIO.read(new ByteArrayInputStream(imageBytes));
    }

    private byte[] withExifOrientation(byte[] jpeg, int orientation) {
        byte[] app1 = {
                (byte) 0xFF, (byte) 0xE1, 0x00, 0x22,
                'E', 'x', 'i', 'f', 0x00, 0x00,
                'M', 'M', 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,
                0x00, 0x01,
                0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
                0x00, (byte) orientation, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00
        };
        byte[] result = new byte[jpeg.length + app1.length];
        System.arraycopy(jpeg, 0, result, 0, 2);
        System.arraycopy(app1, 0, result, 2, app1.length);
        System.arraycopy(jpeg, 2, result, 2 + app1.length, jpeg.length - 2);
        return result;
    }
}
