package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** PIXEL_PP_V1의 규격, 팔레트 제한, 확대 보간 규칙을 검증한다. */
class PixelPostProcessorTest {

    private final PixelPostProcessor postProcessor = new PixelPostProcessor();

    @Test
    void postProcess_createsOpaque480PngWithAtMost24Colors() throws Exception {
        BufferedImage source = colorfulImage();
        source.setRGB(0, 0, 0x00000000);

        BufferedImage result = decode(postProcessor.postProcess(writePng(source)));

        assertThat(result.getWidth()).isEqualTo(480);
        assertThat(result.getHeight()).isEqualTo(480);
        assertThat(result.getColorModel().hasAlpha()).isFalse();
        assertThat(distinctColors(result)).hasSizeLessThanOrEqualTo(24);
    }

    @Test
    void postProcess_usesNearestNeighborForEnlargement() throws Exception {
        BufferedImage source = new BufferedImage(1024, 1024, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < source.getHeight(); y++) {
            for (int x = 0; x < source.getWidth(); x++) {
                source.setRGB(x, y, x < 512 ? Color.RED.getRGB() : Color.BLUE.getRGB());
            }
        }

        BufferedImage result = decode(postProcessor.postProcess(writePng(source)));

        // bilinear 축소 후에도 두 색만 남고, nearest-neighbor 확대는 새 중간색을 만들지 않는다.
        assertThat(distinctColors(result)).containsExactlyInAnyOrder(0x00FF0000, 0x000000FF);
    }

    @Test
    void postProcess_rejectsInputThatDidNotPassThe1024SquareContract() throws Exception {
        BufferedImage unexpectedSize = new BufferedImage(1024, 768, BufferedImage.TYPE_INT_RGB);

        assertThatThrownBy(() -> postProcessor.postProcess(writePng(unexpectedSize)))
                .isInstanceOf(PixelPostProcessor.InvalidPixelPostprocessException.class)
                .hasMessageContaining("1024×1024");
    }

    @Test
    void postProcess_rejectsCorruptedBytes() {
        assertThatThrownBy(() -> postProcessor.postProcess(new byte[]{1, 2, 3}))
                .isInstanceOf(PixelPostProcessor.InvalidPixelPostprocessException.class);
    }

    private BufferedImage colorfulImage() {
        BufferedImage image = new BufferedImage(1024, 1024, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int red = x * 255 / 1023;
                int green = y * 255 / 1023;
                int blue = (x + y) * 255 / 2046;
                image.setRGB(x, y, new Color(red, green, blue).getRGB());
            }
        }
        return image;
    }

    private Set<Integer> distinctColors(BufferedImage image) {
        Set<Integer> colors = new HashSet<>();
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                colors.add(image.getRGB(x, y) & 0x00FFFFFF);
            }
        }
        return colors;
    }

    private byte[] writePng(BufferedImage image) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, "png", output)).isTrue();
        return output.toByteArray();
    }

    private BufferedImage decode(byte[] bytes) throws Exception {
        return ImageIO.read(new ByteArrayInputStream(bytes));
    }
}
