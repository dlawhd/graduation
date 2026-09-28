package shop.esjh.memoryjar.config;

import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import shop.esjh.memoryjar.config.properties.AiGenerationExecutionProperties;

import java.util.Map;
import java.util.concurrent.Executor;

/**
 * 오래 걸리는 AI 이미지 생성을 HTTP 요청 스레드와 분리하는 제한된 실행기를 등록한다.
 * 요청 traceId는 백그라운드 로그에도 이어지도록 MDC를 복사한다.
 */
@Configuration
@EnableAsync
public class AiGenerationAsyncConfig {

    @Bean(name = "aiGenerationTaskExecutor")
    public Executor aiGenerationTaskExecutor(AiGenerationExecutionProperties properties) {
        int poolSize = Math.max(1, properties.getPoolSize());
        int queueCapacity = Math.max(0, properties.getQueueCapacity());

        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(poolSize);
        executor.setMaxPoolSize(poolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("ai-generation-");
        executor.setTaskDecorator(task -> decorateWithMdc(task, MDC.getCopyOfContextMap()));
        executor.initialize();
        return executor;
    }

    /** 작업을 받은 HTTP 요청의 traceId를 복원하고, 작업 종료 뒤 스레드의 MDC를 깨끗이 비운다. */
    private Runnable decorateWithMdc(Runnable task, Map<String, String> contextMap) {
        return () -> {
            Map<String, String> previousContext = MDC.getCopyOfContextMap();
            try {
                if (contextMap == null) {
                    MDC.clear();
                } else {
                    MDC.setContextMap(contextMap);
                }
                task.run();
            } finally {
                if (previousContext == null) {
                    MDC.clear();
                } else {
                    MDC.setContextMap(previousContext);
                }
            }
        };
    }
}
