package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI 후보 생성 백그라운드 작업의 동시 실행 수와 대기열 크기를 관리한다.
 * 외부 AI 비용과 서버 자원을 보호하기 위해 무제한 스레드나 무제한 큐를 사용하지 않는다.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.ai-generation-execution")
public class AiGenerationExecutionProperties {

    /** 서로 다른 Draft에서 동시에 실행할 수 있는 AI 생성 작업 수다. */
    private int poolSize = 2;

    /** 실행 중인 작업 외에 서버 메모리에서 기다릴 수 있는 작업 수다. */
    private int queueCapacity = 20;
}
