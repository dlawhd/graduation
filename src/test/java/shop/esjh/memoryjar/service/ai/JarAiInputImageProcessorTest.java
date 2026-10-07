package shop.esjh.memoryjar.service.ai;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;
import static org.assertj.core.api.Assertions.*;

/** AI 입력에서 선택 밖의 장면이 빠지고 비율·원본 바이트가 보존되는지 외부 호출 없이 검증한다. */
class JarAiInputImageProcessorTest {
    @Test void legacyInputIsNotRewritten() {
        byte[] original={1,2,3};
        assertThat(JarAiInputImageProcessor.prepare(original,null)).isSameAs(original);
    }
    @Test void selectedSceneExcludesOtherHalfAndKeepsAspect() throws Exception {
        byte[] original=twoColors();
        var output=decode(JarAiInputImageProcessor.prepare(original,frame(".5","0",".5","1")));
        assertThat(output.getWidth()).isEqualTo(480);
        assertThat(output.getHeight()).isEqualTo(480);
        assertThat(output.getRGB(240,240)&0xffffff).isEqualTo(Color.BLUE.getRGB()&0xffffff);
        assertThat(output.getRGB(0,240)&0xffffff).isEqualTo(0xffffff);
        assertThat(output.getRGB(119,240)&0xffffff).isEqualTo(0xffffff);
        assertThat(output.getRGB(120,240)&0xffffff).isEqualTo(0x0000ff);
        assertThat(decode(original).getRGB(20,20)&0xffffff).isEqualTo(0xff0000);
    }
    @Test void tinySelectionAtBottomRightStillHasOnePixel() throws Exception {
        var result=decode(JarAiInputImageProcessor.prepare(twoColors(),frame(".999999",".999999",".000001",".000001")));
        assertThat(result.getRGB(240,240)&0xffffff).isEqualTo(0x0000ff);
    }
    /** 가로 사진을 정사각형에 넣어도 장면의 양쪽 색은 남고 사진 바깥 여백만 흰색이다. */
    @Test void rectangularSceneKeepsBothSidesAndOnlyPadsOutsideWithWhite() throws Exception {
        byte[] original = twoColors();
        var output = decode(JarAiInputImageProcessor.prepare(original, frame("0", ".25", "1", ".5")));
        assertThat(output.getRGB(20, 240) & 0xffffff).isEqualTo(0xff0000);
        assertThat(output.getRGB(460, 240) & 0xffffff).isEqualTo(0x0000ff);
        assertThat(output.getRGB(240, 119) & 0xffffff).isEqualTo(0xffffff);
        assertThat(output.getRGB(240, 360) & 0xffffff).isEqualTo(0xffffff);
        assertThat(decode(original).getRGB(20, 20) & 0xffffff).isEqualTo(0xff0000);
        assertThat(decode(original).getRGB(460, 460) & 0xffffff).isEqualTo(0x0000ff);
    }
    @Test void rejectsMalformedAndOutOfBoundsInput() throws Exception {
        assertThatThrownBy(()->JarAiInputImageProcessor.prepare(new byte[]{1},frame("0","0","1","1")))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->JarAiInputImageProcessor.prepare(twoColors(),frame(".9","0",".2","1")))
            .isInstanceOf(shop.esjh.memoryjar.config.exception.ApiException.class);
    }
    static JarPhotoFrameValue frame(String x,String y,String w,String h) {
        return new JarPhotoFrameValue(new BigDecimal(x),new BigDecimal(y),new BigDecimal(w),new BigDecimal(h));
    }
    static byte[] twoColors() throws Exception {
        var image=new BufferedImage(480,480,BufferedImage.TYPE_INT_RGB);
        var g=image.createGraphics();
        try {g.setColor(Color.RED);g.fillRect(0,0,240,480);g.setColor(Color.BLUE);g.fillRect(240,0,240,480);}
        finally {g.dispose();}
        var output=new ByteArrayOutputStream(); ImageIO.write(image,"png",output);return output.toByteArray();
    }
    static BufferedImage decode(byte[] data) throws Exception {return ImageIO.read(new ByteArrayInputStream(data));}
}
