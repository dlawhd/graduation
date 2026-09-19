package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cloudflare Workers AI 호출에 필요한 실행 환경 설정이다.
 *
 * API Token은 소스나 로그에 저장하지 않고 환경 변수로만 주입한다.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.ai.cloudflare")
public class CloudflareAiProperties {

    /** Cloudflare Workers AI를 사용할 계정 ID다. */
    private String accountId;

    /** Workers AI 권한만 가진 API Token이다. */
    private String apiToken;

    /** 현재 AI 디자인에서 사용할 기본 Workers AI 모델 식별자다. */
    private String model = "@cf/black-forest-labs/flux-2-klein-4b";

    /** 연결 및 응답 대기에 사용할 HTTP 요청 제한 시간(초)이다. */
    private long timeoutSeconds = 60;
}
