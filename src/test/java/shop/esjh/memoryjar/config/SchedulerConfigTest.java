package shop.esjh.memoryjar.config;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

/** AI 정리 스레드가 막혀 있어도 일반 자동 오픈 스케줄러는 실행되는지 실제 실행기로 검증한다. */
class SchedulerConfigTest {
    @Test
    void blockedCleanupCannotBlockLifecycleScheduler() throws Exception {
        var config = new SchedulerConfig();
        var cleanup = config.aiCleanupTaskScheduler();
        var lifecycle = config.taskScheduler();
        cleanup.initialize(); lifecycle.initialize();
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var opened = new CountDownLatch(1);
        try {
            cleanup.execute(() -> {
                entered.countDown();
                try { release.await(5, TimeUnit.SECONDS); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            });
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            lifecycle.execute(opened::countDown);
            assertThat(opened.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(release.getCount()).isEqualTo(1);
        } finally { release.countDown(); cleanup.shutdown(); lifecycle.shutdown(); }
    }
}
