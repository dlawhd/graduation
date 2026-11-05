package shop.esjh.memoryjar.service.note;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.*;

/** 요청 제한이 동시 호출·시간 경계·사용자 증가에서도 같은 규칙을 유지하는지 확인한다. */
class PlaceSearchRateLimiterTest {
    private final PlaceSearchRateLimiter limiter = new PlaceSearchRateLimiter();
    private static final long SECOND = TimeUnit.SECONDS.toNanos(1);

    @Test void sameAccountBurstAndMinuteQuotaAreLimited() {
        limiter.consume(1, 0);
        assertLimited(() -> limiter.consume(1, 0));
        for (int i = 1; i < 20; i++) limiter.consume(1, i * SECOND);
        assertLimited(() -> limiter.consume(1, 20 * SECOND));
        limiter.consume(1, 60 * SECOND);
        limiter.consume(2, 60 * SECOND);
    }
    @Test void concurrentRequestsCannotBypassBurstLimit() {
        var passed = new java.util.concurrent.atomic.AtomicInteger();
        IntStream.range(0, 100).parallel().forEach(i -> {
            try { limiter.consume(1, 0); passed.incrementAndGet(); }
            catch (ResponseStatusException expected) { assertThat(expected.getStatusCode().value()).isEqualTo(429); }
        });
        assertThat(passed.get()).isEqualTo(1);
    }
    @Test void memoryIsBoundedAndExpiredAccountsAreReclaimed() {
        for (long i = 1; i <= 4096; i++) limiter.consume(i, 0);
        assertLimited(() -> limiter.consume(4097, 0));
        limiter.consume(4097, 60 * SECOND);
    }
    private static void assertLimited(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode().value()).isEqualTo(429));
    }
}
