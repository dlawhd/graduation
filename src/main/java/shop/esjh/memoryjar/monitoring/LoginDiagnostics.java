package shop.esjh.memoryjar.monitoring;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 명시적으로 켠 로그인 요청만 시간 구간으로 측정한다. 입력값·사용자·토큰·예외 원문은 받지 않는다. */
@Component
public class LoginDiagnostics {
    public enum Stage { CREDENTIAL_LOOKUP, PASSWORD_VERIFY, AUTH_SERVICE, REFRESH_TRANSACTION, JWT_CREATE, COOKIE_WRITE }
    private static final ThreadLocal<Attempt> CURRENT = new ThreadLocal<>();
    private static final int CAPACITY = 64;
    private final boolean enabled;
    private final Supplier<JvmGcMetrics.Snapshot> gc;
    private final ArrayDeque<Sample> recent = new ArrayDeque<>();
    private final AtomicLong ids = new AtomicLong();

    @Autowired
    public LoginDiagnostics(@Value("${app.monitoring.login-diagnostics-enabled:false}") boolean enabled) {
        this(enabled, JvmGcMetrics::read);
    }

    LoginDiagnostics(boolean enabled, Supplier<JvmGcMetrics.Snapshot> gc) { this.enabled = enabled; this.gc = gc; }

    /** ThreadLocal은 동기 로그인 한 요청에만 연결하고 반드시 finish에서 제거한다. */
    Attempt start() {
        if (!enabled || CURRENT.get() != null) return null;
        var attempt = new Attempt(ids.incrementAndGet(), safeGc());
        CURRENT.set(attempt);
        return attempt;
    }

    void finish(Attempt attempt, Integer status, boolean completed) {
        if (attempt == null) return;
        CURRENT.remove();
        try {
            long elapsed = System.nanoTime() - attempt.startedNanos;
            var after = safeGc();
            var sample = new Sample(attempt.id, attempt.startedAt, Instant.now().toString(), elapsed,
                    status, completed, Map.copyOf(attempt.stages),
                    delta(attempt.gcBefore, after, true), delta(attempt.gcBefore, after, false));
            synchronized (recent) {
                if (recent.size() == CAPACITY) recent.removeFirst();
                recent.addLast(sample);
            }
        } catch (RuntimeException unavailable) {
            // 부가 계측 실패가 인증 결과나 원래 예외를 바꾸지 않도록 한다.
        }
    }

    /** 고정 enum 구간만 허용한다. 공급자 반환값·예외 메시지는 저장하지 않고 그대로 호출자에게 전달한다. */
    public static <T> T measure(Stage stage, Supplier<T> operation) {
        var attempt = CURRENT.get();
        if (attempt == null) return operation.get();
        long start = System.nanoTime();
        boolean completed = false;
        try {
            T value = operation.get();
            completed = true;
            return value;
        } finally {
            attempt.stages.put(stage, new Timing(System.nanoTime() - start, completed));
        }
    }

    public Snapshot snapshot() {
        synchronized (recent) { return new Snapshot(enabled, CAPACITY, List.copyOf(recent)); }
    }

    private JvmGcMetrics.Snapshot safeGc() {
        try { return gc.get(); } catch (RuntimeException unavailable) { return null; }
    }

    private static Long delta(JvmGcMetrics.Snapshot before, JvmGcMetrics.Snapshot after, boolean count) {
        if (before == null || after == null) return null;
        Long a = count ? before.totalCollectionCount() : before.totalCollectionTimeMillis();
        Long b = count ? after.totalCollectionCount() : after.totalCollectionTimeMillis();
        return a == null || b == null || b < a ? null : b - a;
    }

    static final class Attempt {
        final long id;
        final String startedAt = Instant.now().toString();
        final long startedNanos = System.nanoTime();
        final JvmGcMetrics.Snapshot gcBefore;
        final EnumMap<Stage, Timing> stages = new EnumMap<>(Stage.class);
        Attempt(long id, JvmGcMetrics.Snapshot gcBefore) { this.id = id; this.gcBefore = gcBefore; }
    }

    public record Timing(long elapsedNanos, boolean completed) { }
    public record Sample(long diagnosticId, String startedAt, String completedAt, long elapsedNanos,
                         Integer responseStatus, boolean completed, Map<Stage, Timing> stages,
                         Long jvmGcCountDelta, Long jvmGcTimeMillisDelta) { }
    public record Snapshot(boolean enabled, int capacity, List<Sample> recent) { }
}
