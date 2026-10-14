package shop.esjh.memoryjar.service.jar;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.repository.ai.JarDesignRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import java.io.IOException;

/** 활성 멤버에게만 저장된 PNG를 전달한다. 임의 URL을 받지 않아 외부 주소 프록시/SSRF가 되지 않는다. */
@Service
@RequiredArgsConstructor
public class JarDesignTextureService {
    public enum Part { IMAGE, BODY }
    static final int MAX_BYTES=16*1024*1024;
    private final JarMemberRepository members;
    private final JarDesignRepository designs;
    private final S3Client s3;
    private final S3Properties properties;
    private final PlatformTransactionManager transactionManager;

    /** 짧은 DB 트랜잭션에서 권한/키만 조회하고 느린 S3 읽기는 트랜잭션 밖에서 실행한다. */
    public byte[] read(Long userId,Long jarId,Part part) {
        var transactions=new TransactionTemplate(transactionManager);
        transactions.setReadOnly(true);
        String key=transactions.execute(status->{
            if(!members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId,userId))
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,"활성 멤버만 디자인을 볼 수 있습니다.");
            var design=designs.findByJar_JarId(jarId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"디자인이 없습니다."));
            String value=part==Part.BODY?design.getBodyArtworkS3Key():design.getFinalS3Key();
            if(value==null||value.isBlank())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"이미지가 없습니다.");
            return value;
        });
        try(var stream=s3.getObject(GetObjectRequest.builder().bucket(properties.getBucket()).key(key).build())) {
            // 잘못된 저장 객체가 서버 메모리를 무제한 사용하지 않도록 응답 헤더와 실제 바이트를 모두 제한한다.
            Long length=stream.response().contentLength();
            if(length!=null&&length>MAX_BYTES)throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"이미지 크기를 확인해 주세요.");
            byte[] bytes=stream.readNBytes(MAX_BYTES+1);
            if(bytes.length>MAX_BYTES||bytes.length<8||bytes[0]!=(byte)0x89||bytes[1]!='P'||bytes[2]!='N'||bytes[3]!='G'
                ||bytes[4]!=13||bytes[5]!=10||bytes[6]!=26||bytes[7]!=10)
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"이미지 형식을 확인해 주세요.");
            return bytes;
        } catch(IOException|software.amazon.awssdk.core.exception.SdkException failure) {
            // S3 키/서명/SDK 오류를 사용자에게 노출하지 않는다.
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"디자인 이미지를 불러오지 못했습니다.");
        }
    }
}
