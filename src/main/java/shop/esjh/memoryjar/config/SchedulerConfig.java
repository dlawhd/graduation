package shop.esjh.memoryjar.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** 오래 걸리는 AI 파일 정리를 자동 오픈·세션 검사와 별도 스레드에서 실행한다. */
@Configuration
public class SchedulerConfig {
    @Bean
    public ThreadPoolTaskScheduler taskScheduler() {
        return scheduler("jar-lifecycle-");
    }

    @Bean
    public ThreadPoolTaskScheduler aiCleanupTaskScheduler() {
        return scheduler("ai-cleanup-");
    }

    /** 문의 사진 삭제가 느려져도 자동 오픈이나 AI 후보 정리를 지연시키지 않는다. */
    @Bean
    public ThreadPoolTaskScheduler supportCleanupTaskScheduler() {
        return scheduler("support-cleanup-");
    }

    private ThreadPoolTaskScheduler scheduler(String prefix) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix(prefix);
        scheduler.setRemoveOnCancelPolicy(true);
        scheduler.setAwaitTerminationSeconds(10);
        return scheduler;
    }
}
