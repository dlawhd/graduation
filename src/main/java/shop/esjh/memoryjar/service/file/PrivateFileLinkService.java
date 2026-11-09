package shop.esjh.memoryjar.service.file;

import java.net.URI;
import java.time.Duration;
import org.springframework.stereotype.Service;
import shop.esjh.memoryjar.config.properties.S3Properties;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

/** 권한 검사를 통과한 파일에만 60초 읽기 주소를 발급한다. 영상의 Range 재생도 S3가 처리한다. */
@Service
public class PrivateFileLinkService {
    private final S3Presigner signer;
    private final S3Properties properties;
    public PrivateFileLinkService(S3Presigner signer,S3Properties properties) { this.signer=signer; this.properties=properties; }
    public URI sign(FileReadAccessService.ReadTarget target) {
        var request=GetObjectRequest.builder().bucket(properties.getBucket()).key(target.key())
                .responseContentType(target.contentType()).responseContentDisposition("inline")
                .responseCacheControl("private, no-store").build();
        return URI.create(signer.presignGetObject(GetObjectPresignRequest.builder().signatureDuration(Duration.ofSeconds(60))
                .getObjectRequest(request).build()).url().toString());
    }
}
