package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** AI Generation timeout과 종료 Draft의 임시 S3 정리 주기를 설정한다. */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.ai-cleanup")
public class AiCleanupProperties {

    private long generationTimeoutSeconds = 600;
    private long terminalDraftGraceSeconds = 600;
    private long schedulerFixedDelayMs = 300_000;
    private int batchSize = 100;
}
