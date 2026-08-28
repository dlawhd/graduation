package shop.esjh.memoryjar.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import shop.esjh.memoryjar.config.properties.SesProperties;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sesv2.SesV2Client;

/*
 * SesConfig 역할
 *
 * Memory Jar에서 Amazon SES를 사용할 수 있도록
 * SesV2Client를 Spring Bean으로 등록하는 설정 클래스야.
 *
 *
 * 현재 S3Config와 같은 방식으로:
 *
 * DefaultCredentialsProvider
 *
 * 를 사용한다.
 *
 * 그래서 AWS Access Key / Secret Key를
 * 소스코드에 직접 넣지 않는다.
 *
 *
 * 로컬:
 * → AWS CLI 설정 또는 환경변수
 *
 * EC2:
 * → 가능하면 IAM Role
 *
 * 에서 AWS 인증정보를 가져온다.
 */
@Configuration
@EnableConfigurationProperties(SesProperties.class)
public class SesConfig {

    /*
     * 실제 Amazon SES에 이메일 발송 요청을 보낼 Client
     */
    @Bean
    public SesV2Client sesV2Client(
            SesProperties sesProperties
    ) {

        return SesV2Client.builder()

                /*
                 * SES는 Region별 서비스이므로
                 * 우리가 설정한 Region을 사용한다.
                 */
                .region(
                        Region.of(
                                sesProperties.getRegion()
                        )
                )

                /*
                 * 기존 S3Config와 같은 인증방식
                 *
                 * Access Key를 코드에 직접 적지 않는다.
                 */
                .credentialsProvider(
                        DefaultCredentialsProvider.create()
                )

                .build();
    }
}