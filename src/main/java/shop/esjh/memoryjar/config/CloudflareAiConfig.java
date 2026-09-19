package shop.esjh.memoryjar.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import shop.esjh.memoryjar.config.properties.CloudflareAiProperties;

import java.net.http.HttpClient;
import java.time.Duration;

/**
 * Cloudflare Workers AI 전용 HTTP Client를 등록한다.
 *
 * Cloudflare 설정이 없는 기존 기능도 실행돼야 하므로, 실제 자격 증명 검사는
 * 애플리케이션 시작 시점이 아니라 Cloudflare 호출 직전에 수행한다.
 */
@Configuration
@EnableConfigurationProperties(CloudflareAiProperties.class)
public class CloudflareAiConfig {

    @Bean
    public HttpClient cloudflareAiHttpClient(CloudflareAiProperties properties) {
        long safeTimeoutSeconds = Math.max(properties.getTimeoutSeconds(), 1L);

        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(safeTimeoutSeconds))
                .build();
    }
}
