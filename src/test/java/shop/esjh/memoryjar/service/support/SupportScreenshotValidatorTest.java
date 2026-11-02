package shop.esjh.memoryjar.service.support;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.*;
import java.util.zip.CRC32;
import static org.assertj.core.api.Assertions.*;

/** 이미지 선언을 믿지 않고 실제 내용, 해상도와 애니메이션을 검사하는지 확인한다. */
class SupportScreenshotValidatorTest {
    private final SupportScreenshotValidator validator=new SupportScreenshotValidator();
    private byte[] image(int w,int h,String format) throws Exception {
        var source=new BufferedImage(w,h,"jpeg".equals(format)?BufferedImage.TYPE_INT_RGB:BufferedImage.TYPE_INT_ARGB);
        var bytes=new ByteArrayOutputStream();ImageIO.write(source,format,bytes);source.flush();return bytes.toByteArray();
    }
    @Test void validJpegAndPngBecomeSmallPngWithoutMetadata() throws Exception {
        for(String format:new String[]{"jpeg","png"}) {
            byte[] result=validator.normalize(image(2400,1200,format));
            var decoded=ImageIO.read(new ByteArrayInputStream(result));
            assertThat(decoded.getWidth()).isEqualTo(1600);assertThat(decoded.getHeight()).isEqualTo(800);
            assertThat(result).startsWith(new byte[]{(byte)137,80,78,71});decoded.flush();
        }
    }
    @Test void invalidOversizedAndHugeDecodedImagesAreRejected() throws Exception {
        for(byte[] bytes:new byte[][]{new byte[0],"<svg/>".getBytes(),new byte[SupportScreenshotValidator.MAX_BYTES+1],image(4001,3000,"png"),image(20,20,"gif")})
            assertThatThrownBy(()->validator.normalize(bytes)).isInstanceOf(ResponseStatusException.class);
    }
    @Test void animatedPngIsRejectedEvenWhenDecoderOnlyExposesFirstFrame() throws Exception {
        byte[] original=image(20,20,"png");var chunk=new ByteArrayOutputStream();var data=new DataOutputStream(chunk);
        data.writeInt(8);byte[] typeAndData=ByteBuffer.allocate(12).put("acTL".getBytes()).putInt(2).putInt(0).array();
        data.write(typeAndData);var crc=new CRC32();crc.update(typeAndData);data.writeInt((int)crc.getValue());
        var animated=new ByteArrayOutputStream();animated.write(original,0,33);animated.write(chunk.toByteArray());animated.write(original,33,original.length-33);
        assertThatThrownBy(()->validator.normalize(animated.toByteArray())).isInstanceOf(ResponseStatusException.class);
    }
    @Test void realStaticWebpIsDecodedAndAnimatedWebpIsRejected() throws Exception {
        byte[] webp=java.util.Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");
        var decoded=ImageIO.read(new ByteArrayInputStream(validator.normalize(webp)));
        assertThat(decoded.getWidth()).isEqualTo(1);assertThat(decoded.getHeight()).isEqualTo(1);decoded.flush();
        byte[] animated=java.util.Arrays.copyOf(webp,webp.length+14);var buffer=ByteBuffer.wrap(animated).order(ByteOrder.LITTLE_ENDIAN);
        buffer.putInt(4,animated.length-8);buffer.position(webp.length);buffer.put("ANIM".getBytes()).putInt(6).put(new byte[6]);
        assertThatThrownBy(()->validator.normalize(animated)).isInstanceOf(ResponseStatusException.class);
    }
}
