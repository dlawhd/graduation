package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cloudflare가 반환한 일반 AI 후보 이미지의 안전한 저장 규격을 설정에서 읽는다.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.ai-generation")
public class AiGenerationImageProperties {

    // Cloudflare Base64 응답을 디코딩한 뒤 허용할 최대 이미지 바이트다.
    private long maxGeneratedImageSize = 10L * 1024 * 1024;

    // 일반 AI 후보는 요청·저장·표시 계약을 모두 1024×1024 정사각형으로 고정한다.
    private int requiredGeneratedImageWidth = 1024;
    private int requiredGeneratedImageHeight = 1024;
}
