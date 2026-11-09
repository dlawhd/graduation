package shop.esjh.memoryjar.service.file;
import java.nio.file.*;
import org.junit.jupiter.api.*;import org.junit.jupiter.api.io.TempDir;
import com.fasterxml.jackson.databind.ObjectMapper;
import shop.esjh.memoryjar.config.properties.*;import software.amazon.awssdk.services.s3.S3Client;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;import static org.mockito.Mockito.*;
/** 사진이 없는 단색 시험 영상으로 실제 ffprobe의 영상·오디오 전용·위장 파일 구분을 확인한다. */
class UploadedMediaVideoTest {
 @TempDir Path temp;
 UploadedMediaValidator validator()throws Exception {
  var properties=new FileProperties();var portable=Path.of("build/security-tools/ffprobe.exe");
  if(System.getProperty("os.name").startsWith("Windows") && Files.isRegularFile(portable))properties.setFfprobeExecutable(portable.toAbsolutePath().toString());
  try{var process=new ProcessBuilder(properties.getFfprobeExecutable(),"-version").redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();Assumptions.assumeTrue(process.waitFor()==0,"ffprobe 설치 필요");}
  catch(java.io.IOException missing){Assumptions.assumeTrue(false,"ffprobe 설치 필요");}
  return new UploadedMediaValidator(mock(S3Client.class),new S3Properties(),properties,new ObjectMapper());
 }
 @Test void realVideoContainersAreAccepted()throws Exception {var validator=validator();
  assertThatCode(()->validator.validateContent(Path.of("src/test/resources/media-security/video.mp4"),"video/mp4")).doesNotThrowAnyException();
  assertThatCode(()->validator.validateContent(Path.of("src/test/resources/media-security/video.mp4"),"video/quicktime")).doesNotThrowAnyException();
  assertThatCode(()->validator.validateContent(Path.of("src/test/resources/media-security/video.webm"),"video/webm")).doesNotThrowAnyException();}
 @Test void audioOnlyAndWrongContainerAreNotVideos()throws Exception{var validator=validator();
  assertThatThrownBy(()->validator.validateContent(Path.of("src/test/resources/media-security/audio-only.mp4"),"video/mp4")).isInstanceOf(ResponseStatusException.class);
  assertThatThrownBy(()->validator.validateContent(Path.of("src/test/resources/media-security/video.mp4"),"video/webm")).isInstanceOf(ResponseStatusException.class);
 }
 @Test void arbitraryBytesAndTruncatedContainerAreRejected()throws Exception{var validator=validator();var fake=temp.resolve("fake.mp4");Files.writeString(fake,"not a video");
  assertThatThrownBy(()->validator.validateContent(fake,"video/mp4")).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(400));
  Files.write(fake,java.util.Arrays.copyOf(Files.readAllBytes(Path.of("src/test/resources/media-security/video.mp4")),24));
  assertThatThrownBy(()->validator.validateContent(fake,"video/mp4")).isInstanceOf(ResponseStatusException.class);
 }
}
