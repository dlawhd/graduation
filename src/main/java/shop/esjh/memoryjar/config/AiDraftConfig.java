package shop.esjh.memoryjar.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import shop.esjh.memoryjar.config.properties.AiGenerationImageProperties;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.config.properties.S3Properties;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.rekognition.RekognitionClient;

/**
 * AI Draft 원본을 동기 심사하기 위한 Rekognition Client와 정책 설정을 등록한다.
 */
@Configuration
@EnableConfigurationProperties({AiDraftProperties.class, AiGenerationImageProperties.class})
public class AiDraftConfig {

    /**
     * S3와 동일한 AWS Region 및 기본 자격 증명 체인을 사용한다.
     * 자격 증명은 코드에 넣지 않고 실행 환경의 IAM Role 또는 환경 변수에서만 읽는다.
     */
    @Bean
    public RekognitionClient rekognitionClient(S3Properties s3Properties) {
        return RekognitionClient.builder()
                .region(Region.of(s3Properties.getRegion()))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }
}
