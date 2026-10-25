package shop.esjh.memoryjar.service.jar;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

/** 외부 통신 없이 만료·용량·동시 다운로드 병합·실패·배열 소유권을 결정적으로 검사한다. */
class JarDesignTextureCacheTest {
    private JarDesignTextureCache cache(AtomicLong clock, int count, long bytes, int itemBytes, int inFlight) {
        return new JarDesignTextureCache(true, count, bytes, itemBytes, inFlight,
                Duration.ofNanos(10), Duration.ofSeconds(2), clock::get);
    }

    @Test void springPropertyCanDisableCachingWithoutChangingImageRead() {
        new ApplicationContextRunner().withUserConfiguration(JarDesignTextureCache.class)
                .withPropertyValues("app.jar-design.texture-cache-enabled=false").run(context -> {
                    var cache = context.getBean(JarDesignTextureCache.class); var calls = new AtomicInteger();
                    for (int i = 0; i < 2; i++) cache.read("bucket", "image", () -> { calls.incrementAndGet(); return new byte[8]; });
                    assertThat(calls).hasValue(2); assertThat(entries(cache)).isEmpty();
                });
    }

    @Test void cacheHitReturnsIndependentArraysAndBucketAndObjectKeysAreSeparate() {
        var cache = cache(new AtomicLong(), 10, 100, 10, 2); var calls = new AtomicInteger();
        var first = cache.read("bucket", "image", () -> { calls.incrementAndGet(); return new byte[]{1, 2}; });
        first[0] = 9;
        var second = cache.read("bucket", "image", () -> { throw new AssertionError("must hit"); });
        assertThat(second).containsExactly((byte) 1, (byte) 2).isNotSameAs(first); second[1] = 9;
        assertThat(cache.read("bucket", "image", () -> { throw new AssertionError(); })).containsExactly((byte) 1, (byte) 2);
        cache.read("other-bucket", "image", () -> { calls.incrementAndGet(); return new byte[2]; });
        cache.read("bucket", "body", () -> { calls.incrementAndGet(); return new byte[2]; });
        assertThat(calls).hasValue(3);
        assertThat(entries(cache).keySet().toString()).doesNotContain("other-bucket", "image", "body");
    }

    @Test void expiryIsFixedFromWriteAndHitsDoNotExtendIt() {
        var clock = new AtomicLong(); var cache = cache(clock, 2, 20, 10, 2); var calls = new AtomicInteger();
        cache.read("b", "a", () -> { calls.incrementAndGet(); return new byte[2]; });
        clock.set(9); cache.read("b", "a", () -> { throw new AssertionError(); });
        clock.set(10); cache.read("b", "a", () -> { calls.incrementAndGet(); return new byte[2]; });
        assertThat(calls).hasValue(2);
    }

    @Test void scheduledCleanupDropsExpiredReferencesEvenWithoutNewRequests() {
        var clock = new AtomicLong(); var cache = cache(clock, 2, 20, 10, 2);
        cache.read("b", "a", () -> new byte[2]); clock.set(10); cache.evictExpired();
        assertThat(entries(cache)).isEmpty(); assertThat(ReflectionTestUtils.getField(cache, "storedBytes")).isEqualTo(0L);
    }

    @Test void entryCountUsesLeastRecentlyUsedEviction() {
        var cache = cache(new AtomicLong(), 2, 100, 10, 2);
        cache.read("b", "a", () -> new byte[2]); cache.read("b", "b", () -> new byte[2]);
        cache.read("b", "a", () -> { throw new AssertionError(); }); cache.read("b", "c", () -> new byte[2]);
        cache.read("b", "a", () -> { throw new AssertionError("recent item must stay"); });
        var calls = new AtomicInteger(); cache.read("b", "b", () -> { calls.incrementAndGet(); return new byte[2]; });
        assertThat(calls).hasValue(1); assertThat(entries(cache)).hasSize(2);
    }

    @Test void byteWeightIsBoundedAndLargeResponsesAreReturnedButNotRetained() {
        var cache = cache(new AtomicLong(), 10, 10, 6, 2);
        cache.read("b", "a", () -> new byte[6]); cache.read("b", "b", () -> new byte[4]);
        assertThat(ReflectionTestUtils.getField(cache, "storedBytes")).isEqualTo(10L);
        cache.read("b", "c", () -> new byte[5]);
        assertThat((long) ReflectionTestUtils.getField(cache, "storedBytes")).isLessThanOrEqualTo(10);
        var calls = new AtomicInteger();
        for (int i = 0; i < 2; i++) assertThat(cache.read("b", "large", () -> { calls.incrementAndGet(); return new byte[7]; })).hasSize(7);
        assertThat(calls).hasValue(2);
        assertThat((long) ReflectionTestUtils.getField(cache, "storedBytes")).isLessThanOrEqualTo(10);
    }

    @Test void failureIsNotCachedAndNextRequestRetries() {
        var cache = cache(new AtomicLong(), 2, 20, 10, 2); var original = new IllegalStateException("loader failure");
        assertThatThrownBy(() -> cache.read("b", "a", () -> { throw original; })).isSameAs(original);
        assertThat(entries(cache)).isEmpty(); assertThat(inFlight(cache)).isEmpty();
        assertThat(cache.read("b", "a", () -> new byte[]{3})).containsExactly((byte) 3);
    }

    @Test void sameKeyConcurrentRequestsUseOneLoadAndIndependentResponses() throws Exception {
        var cache = cache(new AtomicLong(), 2, 20, 10, 2); var workers = Executors.newFixedThreadPool(2);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var followerThread = new AtomicReference<Thread>();
        var calls = new AtomicInteger();
        try {
            var owner = workers.submit(() -> cache.read("b", "a", () -> { calls.incrementAndGet(); entered.countDown(); await(release); return new byte[]{1}; }));
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            var follower = workers.submit(() -> { followerThread.set(Thread.currentThread()); return cache.read("b", "a", () -> { throw new AssertionError("duplicate load"); }); });
            awaitWaiting(followerThread); release.countDown();
            var first = owner.get(2, TimeUnit.SECONDS); var second = follower.get(2, TimeUnit.SECONDS);
            assertThat(calls).hasValue(1); assertThat(first).isEqualTo(second).isNotSameAs(second);
            first[0] = 9; second[0] = 8;
            assertThat(cache.read("b", "a", () -> { throw new AssertionError(); })).containsExactly((byte) 1);
            assertThat(inFlight(cache)).isEmpty();
        } finally { release.countDown(); workers.shutdownNow(); }
    }

    @Test void slowImageDoesNotHoldGlobalLockAndInFlightMapIsBounded() throws Exception {
        var cache = cache(new AtomicLong(), 2, 20, 10, 1); var workers = Executors.newSingleThreadExecutor();
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        try {
            var owner = workers.submit(() -> cache.read("b", "a", () -> { entered.countDown(); await(release); return new byte[2]; }));
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(cache.read("b", "other", () -> new byte[]{2})).containsExactly((byte) 2);
            assertThat(inFlight(cache)).hasSize(1); assertThat(entries(cache)).isEmpty();
            release.countDown(); owner.get(2, TimeUnit.SECONDS);
        } finally { release.countDown(); workers.shutdownNow(); }
    }

    @Test void ownerFailureIsSharedWithoutPoisoningFollowingRequests() throws Exception {
        var cache = cache(new AtomicLong(), 2, 20, 10, 2); var workers = Executors.newFixedThreadPool(2);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var followerThread = new AtomicReference<Thread>();
        var original = new IllegalStateException("sanitized service error");
        try {
            var owner = workers.submit(() -> cache.read("b", "a", () -> { entered.countDown(); await(release); throw original; }));
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            var follower = workers.submit(() -> { followerThread.set(Thread.currentThread()); return cache.read("b", "a", () -> { throw new AssertionError(); }); });
            awaitWaiting(followerThread); release.countDown();
            assertThatThrownBy(() -> owner.get(2, TimeUnit.SECONDS)).hasCause(original);
            assertThatThrownBy(() -> follower.get(2, TimeUnit.SECONDS)).hasCause(original);
            assertThat(entries(cache)).isEmpty(); assertThat(inFlight(cache)).isEmpty();
            assertThat(cache.read("b", "a", () -> new byte[]{4})).containsExactly((byte) 4);
        } finally { release.countDown(); workers.shutdownNow(); }
    }

    @Test void waitingTimeoutDoesNotCancelOwnerOrExposeObjectKey() throws Exception {
        var cache = new JarDesignTextureCache(true, 2, 20, 10, 2, Duration.ofSeconds(60), Duration.ofMillis(10), System::nanoTime);
        var workers = Executors.newSingleThreadExecutor(); var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        try {
            var owner = workers.submit(() -> cache.read("b", "private-key", () -> { entered.countDown(); await(release); return new byte[]{5}; }));
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> cache.read("b", "private-key", () -> { throw new AssertionError(); }))
                    .isInstanceOf(ResponseStatusException.class).hasMessageNotContaining("private-key");
            release.countDown(); assertThat(owner.get(2, TimeUnit.SECONDS)).containsExactly((byte) 5);
            assertThat(cache.read("b", "private-key", () -> { throw new AssertionError(); })).containsExactly((byte) 5);
        } finally { release.countDown(); workers.shutdownNow(); }
    }

    @Test void interruptedWaiterRestoresInterruptAndDoesNotCancelOtherRequest() throws Exception {
        var cache = cache(new AtomicLong(), 2, 20, 10, 2); var workers = Executors.newFixedThreadPool(2);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var followerThread = new AtomicReference<Thread>();
        var interrupted = new AtomicBoolean();
        try {
            var owner = workers.submit(() -> cache.read("b", "a", () -> { entered.countDown(); await(release); return new byte[]{6}; }));
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            var follower = workers.submit(() -> {
                followerThread.set(Thread.currentThread());
                assertThatThrownBy(() -> cache.read("b", "a", () -> { throw new AssertionError(); })).isInstanceOf(ResponseStatusException.class);
                interrupted.set(Thread.currentThread().isInterrupted());
            });
            awaitWaiting(followerThread); followerThread.get().interrupt(); follower.get(2, TimeUnit.SECONDS);
            assertThat(interrupted).isTrue(); release.countDown(); assertThat(owner.get(2, TimeUnit.SECONDS)).containsExactly((byte) 6);
        } finally { release.countDown(); workers.shutdownNow(); }
    }

    @Test void shutdownDropsRetainedImagesAndPreventsRepopulation() {
        var cache = cache(new AtomicLong(), 2, 20, 10, 2); cache.read("b", "a", () -> new byte[2]); cache.close();
        assertThat(entries(cache)).isEmpty(); cache.read("b", "a", () -> new byte[2]);
        assertThat(entries(cache)).isEmpty(); assertThat(ReflectionTestUtils.getField(cache, "storedBytes")).isEqualTo(0L);
    }

    private static Map<?, ?> entries(JarDesignTextureCache cache) { return (Map<?, ?>) ReflectionTestUtils.getField(cache, "entries"); }
    private static Map<?, ?> inFlight(JarDesignTextureCache cache) { return (Map<?, ?>) ReflectionTestUtils.getField(cache, "inFlight"); }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(3, TimeUnit.SECONDS)) throw new AssertionError("test latch deadline exceeded"); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new AssertionError(interrupted); }
    }
    private static void awaitWaiting(AtomicReference<Thread> thread) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            if (thread.get() != null && thread.get().getState() == Thread.State.TIMED_WAITING) return;
            Thread.onSpinWait();
        }
        throw new AssertionError("follower did not wait on shared load");
    }
}
