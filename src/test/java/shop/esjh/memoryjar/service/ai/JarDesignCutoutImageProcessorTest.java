package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.dto.ai.JarDesignCutoutPoint;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 사용자가 선택하지 않은 배경 픽셀이 실제 최종 PNG에서 투명해지는지 검증한다. */
class JarDesignCutoutImageProcessorTest {

    private final JarDesignCutoutImageProcessor processor = new JarDesignCutoutImageProcessor();

    @Test
    void applyTransparentCutout_keepsOnlyPolygonInterior() throws Exception {
        BufferedImage source = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 10; y++) {
            for (int x = 0; x < 10; x++) {
                source.setRGB(x, y, Color.RED.getRGB());
            }
        }
        ByteArrayOutputStream sourceBytes = new ByteArrayOutputStream();
        ImageIO.write(source, "png", sourceBytes);

        byte[] resultBytes = processor.applyTransparentCutout(sourceBytes.toByteArray(), List.of(
                new JarDesignCutoutPoint(new BigDecimal("0.2"), new BigDecimal("0.2")),
                new JarDesignCutoutPoint(new BigDecimal("0.8"), new BigDecimal("0.2")),
                new JarDesignCutoutPoint(new BigDecimal("0.8"), new BigDecimal("0.8")),
                new JarDesignCutoutPoint(new BigDecimal("0.2"), new BigDecimal("0.8"))));

        BufferedImage result = ImageIO.read(new ByteArrayInputStream(resultBytes));
        assertThat((result.getRGB(0, 0) >>> 24) & 0xff).isZero();
        assertThat((result.getRGB(5, 5) >>> 24) & 0xff).isEqualTo(255);
        assertThat(result.getRGB(5, 5) & 0x00ffffff).isEqualTo(Color.RED.getRGB() & 0x00ffffff);
    }

    @Test
    void applyTransparentCutoutRegions_keepsMultipleSeparatedAreas() throws Exception {
        BufferedImage source = new BufferedImage(20, 10, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < source.getHeight(); y++) {
            for (int x = 0; x < source.getWidth(); x++) {
                source.setRGB(x, y, Color.BLUE.getRGB());
            }
        }
        ByteArrayOutputStream sourceBytes = new ByteArrayOutputStream();
        ImageIO.write(source, "png", sourceBytes);

        List<JarDesignCutoutPoint> left = rectangle("0.05", "0.1", "0.35", "0.9");
        List<JarDesignCutoutPoint> right = rectangle("0.65", "0.1", "0.95", "0.9");
        byte[] resultBytes = processor.applyTransparentCutoutRegions(
                sourceBytes.toByteArray(), List.of(left, right));

        BufferedImage result = ImageIO.read(new ByteArrayInputStream(resultBytes));
        assertThat(alpha(result, 3, 5)).isEqualTo(255);
        assertThat(alpha(result, 16, 5)).isEqualTo(255);
        assertThat(alpha(result, 10, 5)).isZero();
    }

    @Test
    void applyTransparentCutoutRegions_unionsOverlappingRegionsRegardlessOfDrawDirection() throws Exception {
        BufferedImage source = new BufferedImage(20, 10, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream sourceBytes = new ByteArrayOutputStream();
        ImageIO.write(source, "png", sourceBytes);
        List<JarDesignCutoutPoint> clockwise = rectangle("0.1", "0.1", "0.6", "0.9");
        List<JarDesignCutoutPoint> counterClockwise = List.of(
                point("0.4", "0.1"), point("0.4", "0.9"),
                point("0.9", "0.9"), point("0.9", "0.1"));

        byte[] resultBytes = processor.applyTransparentCutoutRegions(
                sourceBytes.toByteArray(), List.of(clockwise, counterClockwise));

        BufferedImage result = ImageIO.read(new ByteArrayInputStream(resultBytes));
        assertThat(alpha(result, 10, 5)).isEqualTo(255);
    }

    private List<JarDesignCutoutPoint> rectangle(String left, String top, String right, String bottom) {
        return List.of(point(left, top), point(right, top), point(right, bottom), point(left, bottom));
    }

    private JarDesignCutoutPoint point(String x, String y) {
        return new JarDesignCutoutPoint(new BigDecimal(x), new BigDecimal(y));
    }

    private int alpha(BufferedImage image, int x, int y) {
        return (image.getRGB(x, y) >>> 24) & 0xff;
    }
}
