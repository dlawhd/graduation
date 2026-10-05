package shop.esjh.memoryjar.config;

import shop.esjh.memoryjar.config.properties.S3Properties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

// S3 관련 Bean을 등록하는 설정 클래스
@Configuration
@EnableConfigurationProperties(S3Properties.class)
public class S3Config {

    // Presigned URL 생성용 Bean
    @Bean
    public S3Presigner s3Presigner(S3Properties s3Properties) {
        return S3Presigner.builder()
                .region(Region.of(s3Properties.getRegion()))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    // 실제 S3 작업(삭제 등)용 Bean
    @Bean
    public S3Client s3Client(S3Properties s3Properties) {
        return S3Client.builder()
                // 늦은 업로드가 정리 유예 기간을 넘어 계속 실행되지 않도록 재시도 포함 시간을 제한한다.
                .overrideConfiguration(config -> config.apiCallTimeout(java.time.Duration.ofSeconds(120))
                        .apiCallAttemptTimeout(java.time.Duration.ofSeconds(30)))
                .region(Region.of(s3Properties.getRegion()))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }
}
