package shop.esjh.memoryjar.service.file;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.auth.credentials.*;import software.amazon.awssdk.regions.Region;
import shop.esjh.memoryjar.config.properties.S3Properties;
import static org.assertj.core.api.Assertions.*;
/** 실제 서명기를 로컬 자격증명 대역으로 실행하며 AWS에는 접속하지 않는다. */
class PrivateFileLinkServiceTest {
 @Test void generatedLinkExpiresInOneMinuteAndDisablesCaching(){var properties=new S3Properties();properties.setBucket("private-fixture");
 try(var signer=S3Presigner.builder().region(Region.AP_NORTHEAST_2).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("fixture-access","fixture-secret"))).build()){
  var uri=new PrivateFileLinkService(signer,properties).sign(new FileReadAccessService.ReadTarget("notes/photo.png","image/png"));
  assertThat(uri.getQuery()).contains("X-Amz-Expires=60","response-cache-control=private, no-store","response-content-type=image/png");
 }
 }
}
