package shop.esjh.memoryjar.service.file;
import java.nio.file.*;import java.awt.image.BufferedImage;import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;
import com.fasterxml.jackson.databind.ObjectMapper;
import shop.esjh.memoryjar.config.properties.*;
import software.amazon.awssdk.services.s3.S3Client;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;import static org.mockito.Mockito.*;
/** 실제 디코더가 유효 이미지와 위장 파일·타입 불일치를 구분하는지 확인한다. */
class UploadedMediaValidatorTest {
 @TempDir Path temp;
 final FileProperties properties=new FileProperties();
 UploadedMediaValidator validator(){return new UploadedMediaValidator(mock(S3Client.class),new S3Properties(),properties,new ObjectMapper());}
 @Test void decodesActualPngJpegAndGifButRejectsMisdeclaredType()throws Exception{for(String type:new String[]{"png","jpeg","gif"}){var file=temp.resolve(type);ImageIO.write(new BufferedImage(16,16,BufferedImage.TYPE_INT_RGB),type,file.toFile());assertThatCode(()->validator().validateContent(file,"image/"+type)).doesNotThrowAnyException();assertThatThrownBy(()->validator().validateContent(file,"image/webp")).isInstanceOf(ResponseStatusException.class);}}
 @Test void arbitraryBytesCannotBeCompletedAsImageOrVideo()throws Exception{var file=temp.resolve("fake");Files.writeString(file,"%PDF-1.4 not an image");assertThatThrownBy(()->validator().validateContent(file,"image/png")).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(400));}
 @Test void missingVideoInspectorFailsClosed()throws Exception{properties.setFfprobeExecutable(temp.resolve("missing-ffprobe").toString());var file=temp.resolve("video");Files.writeString(file,"ftyp");assertThatThrownBy(()->validator().validateContent(file,"video/mp4")).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(503));}
 @Test void actualWebpStillWorksWithExistingImageReader(){assertThatCode(()->validator().validateContent(Path.of("src/test/resources/media-security/image.webp"),"image/webp")).doesNotThrowAnyException();}
}
