package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import static org.assertj.core.api.Assertions.*;

/** 사용자 테두리의 색과 투명도를 보존하고 크기 위장/빈 그림/애니메이션 입력을 차단한다. */
class JarBodyArtworkImageValidatorTest {
    static byte[] png(int size, boolean ink) throws Exception {
        var image=new BufferedImage(size,size,BufferedImage.TYPE_INT_ARGB);
        if(ink) {image.setRGB(10,10,0xffef4444);image.setRGB(20,20,0xff38bdf8);}
        var output=new ByteArrayOutputStream();ImageIO.write(image,"png",output);return output.toByteArray();
    }
    static MockMultipartFile file(byte[] bytes) {return new MockMultipartFile("bodyArtwork","ignored","text/plain",bytes);}
    @Test void reencodingPreservesPaletteAndTransparentInteriorWithoutTrustingMime() throws Exception {
        byte[] source=png(480,true), snapshot=source.clone();
        var image=ImageIO.read(new ByteArrayInputStream(JarBodyArtworkImageValidator.normalize(file(source))));
        assertThat(image.getRGB(10,10)).isEqualTo(0xffef4444);
        assertThat(image.getRGB(20,20)).isEqualTo(0xff38bdf8);
        assertThat(image.getRGB(240,240)>>>24).isZero();assertThat(source).isEqualTo(snapshot);
    }
    @Test void rejectsWrongSizeEmptyForgedOversizedAndAnimatedFiles() throws Exception {
        byte[] apng=png(480,true); ByteBuffer.wrap(apng).putInt(37,0x6163544c);
        for(byte[] bytes:new byte[][]{png(64,true),png(480,false),new byte[]{1,2,3},new byte[1024*1024+1],apng})
            assertThatThrownBy(()->JarBodyArtworkImageValidator.normalize(file(bytes))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->JarBodyArtworkImageValidator.normalize(null)).isInstanceOf(ResponseStatusException.class);
    }
}
