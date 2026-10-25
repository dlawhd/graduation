package shop.esjh.memoryjar.service.jar;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.LongSupplier;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.monitoring.LoginDiagnostics;
import static shop.esjh.memoryjar.monitoring.LoginDiagnostics.Stage.*;

/**
 * 권한 확인을 끝낸 최종 디자인 PNG만 잠시 재사용한다. 디스크·브라우저에 저장하지 않으며,
 * 이미지 바이트 총량/개수/보관 시간을 제한하고 같은 이미지의 동시 S3 읽기를 합친다.
 */
@Component
public class JarDesignTextureCache {
    static final int MAX_ENTRIES = 64;
    static final long MAX_BYTES = 16L * 1024 * 1024;
    static final int MAX_ENTRY_BYTES = 4 * 1024 * 1024;
    static final int MAX_IN_FLIGHT = 8;
    private final boolean enabled;
    private final int maxEntries, maxEntryBytes, maxInFlight;
    private final long maxBytes, ttlNanos, waitNanos;
    private final LongSupplier clock;
    // 두 맵은 짧은 동기화 구간에서만 접근한다. 느린 S3 I/O·결과 대기는 잠금 밖에서 실행한다.
    private final Map<Key, Entry> entries = new LinkedHashMap<>(16, .75f, true);
    private final Map<Key, CompletableFuture<byte[]>> inFlight = new HashMap<>();
    private long storedBytes;
    private boolean closed;

    @Autowired
    public JarDesignTextureCache(@Value("${app.jar-design.texture-cache-enabled:true}") boolean enabled) {
        this(enabled, MAX_ENTRIES, MAX_BYTES, MAX_ENTRY_BYTES, MAX_IN_FLIGHT,
                Duration.ofSeconds(60), Duration.ofSeconds(125), System::nanoTime);
    }

    JarDesignTextureCache(boolean enabled, int maxEntries, long maxBytes, int maxEntryBytes, int maxInFlight,
                         Duration ttl, Duration wait, LongSupplier clock) {
        if (maxEntries < 1 || maxBytes < 1 || maxEntryBytes < 1 || maxInFlight < 1
                || ttl.isZero() || ttl.isNegative() || wait.isZero() || wait.isNegative()) {
            throw new IllegalArgumentException("이미지 캐시 제한을 확인해 주세요.");
        }
        this.enabled = enabled; this.maxEntries = maxEntries; this.maxBytes = maxBytes;
        this.maxEntryBytes = maxEntryBytes; this.maxInFlight = maxInFlight;
        this.ttlNanos = ttl.toNanos(); this.waitNanos = wait.toNanos(); this.clock = Objects.requireNonNull(clock);
    }

    /** 호출자는 매번 멤버 권한과 현재 DB 디자인 키를 먼저 확인해야 한다. 반환 배열은 캐시 원본과 분리한다. */
    byte[] read(String bucket, String objectKey, Supplier<byte[]> validatedLoader) {
        if (!enabled) return LoginDiagnostics.measure(TEXTURE_CACHE_BYPASS, validatedLoader);
        var key = new Key(bucket, objectKey);
        Entry hit;
        CompletableFuture<byte[]> shared;
        boolean owner = false;
        synchronized (this) {
            removeExpired(clock.getAsLong());
            hit = entries.get(key);
            shared = inFlight.get(key);
            if (!closed && hit == null && shared == null && inFlight.size() < maxInFlight) {
                shared = new CompletableFuture<>(); inFlight.put(key, shared); owner = true;
            }
        }
        if (hit != null) return LoginDiagnostics.measure(TEXTURE_CACHE_HIT, () -> hit.bytes().clone());
        // 서로 다른 진행 중 이미지가 상한을 넘으면 기존 직접 읽기로 돌아간다. 대기 맵이 무제한 커지지 않는다.
        if (shared == null) return LoginDiagnostics.measure(TEXTURE_CACHE_BYPASS, validatedLoader);
        var pending = shared;
        if (!owner) return LoginDiagnostics.measure(TEXTURE_CACHE_WAIT, () -> await(pending).clone());
        try {
            return LoginDiagnostics.measure(TEXTURE_CACHE_MISS, () -> {
                // loader는 PNG/크기 검증과 스트림 닫기를 모두 마친 배열만 반환한다. 실패는 캐시하지 않는다.
                byte[] bytes = Objects.requireNonNull(validatedLoader.get());
                synchronized (this) { store(key, bytes, clock.getAsLong()); }
                // 소유자와 대기자 모두 복사본을 받으므로 어느 응답도 공유 중인 원본을 변경할 수 없다.
                pending.complete(bytes);
                return bytes.clone();
            });
        } catch (RuntimeException | Error failure) {
            pending.completeExceptionally(failure);
            throw failure;
        } finally {
            synchronized (this) { inFlight.remove(key, pending); }
        }
    }

    /** 대기 취소/시간 초과는 공유 S3 요청 자체를 취소하지 않아 다른 정상 요청에 전파되지 않는다. */
    private byte[] await(CompletableFuture<byte[]> pending) {
        try { return pending.get(waitNanos, TimeUnit.NANOSECONDS); }
        catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "디자인 이미지 요청이 중단됐습니다.");
        } catch (TimeoutException timeout) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "디자인 이미지 응답을 기다리는 시간이 초과됐습니다.");
        } catch (ExecutionException failure) {
            if (failure.getCause() instanceof RuntimeException original) throw original;
            if (failure.getCause() instanceof Error original) throw original;
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "디자인 이미지를 불러오지 못했습니다.");
        }
    }

    // 저장 후 고정 TTL이다. 자주 읽더라도 비공개 이미지의 보관 시간이 계속 연장되지 않는다.
    private void store(Key key, byte[] bytes, long now) {
        removeExpired(now);
        if (closed || bytes.length > maxEntryBytes || bytes.length > maxBytes) return;
        while (entries.size() >= maxEntries || storedBytes + bytes.length > maxBytes) {
            var oldest = entries.entrySet().iterator();
            var entry = oldest.next(); storedBytes -= entry.getValue().bytes().length; oldest.remove();
        }
        entries.put(key, new Entry(bytes, now)); storedBytes += bytes.length;
    }

    private void removeExpired(long now) {
        var iterator = entries.values().iterator();
        while (iterator.hasNext()) {
            var entry = iterator.next();
            if (now - entry.storedNanos() >= ttlNanos) { storedBytes -= entry.bytes().length; iterator.remove(); }
        }
    }

    /** 요청이 끊겨도 만료된 사진 참조를 주기적으로 해제한다. JVM의 실제 메모리 회수 시점과는 다르다. */
    @Scheduled(fixedDelay = 15_000, initialDelay = 15_000)
    public synchronized void evictExpired() { removeExpired(clock.getAsLong()); }

    @PreDestroy
    public synchronized void close() { closed = true; entries.clear(); storedBytes = 0; }

    // 키는 서버에서 읽은 값만 받고 진단·로그·API에 출력하지 않는다. 이미지/테두리는 서로 다른 객체 키다.
    private record Key(String bucket, String objectKey) {
        private Key { Objects.requireNonNull(bucket); Objects.requireNonNull(objectKey); }
        @Override public String toString() { return "TextureCacheKey[redacted]"; }
    }
    private record Entry(byte[] bytes, long storedNanos) { }
}
