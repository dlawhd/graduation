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

/** 명시적으로 켠 로그인·CSRF 요청만 시간 구간으로 측정한다. 입력값·사용자·토큰·예외 원문은 받지 않는다. */
@Component
public class LoginDiagnostics {
    public enum RequestKind { LOGIN, CSRF, ME, JAR_LIST, JAR_DETAIL, NOTE_LIST }
    public enum Stage { CREDENTIAL_LOOKUP, PASSWORD_VERIFY, AUTH_SERVICE, REFRESH_TRANSACTION, JWT_CREATE, COOKIE_WRITE,
        JWT_VALIDATE, JWT_CLAIMS_PARSE, SESSION_VERSION_QUERY, CSRF_CONTROLLER,
        ME_SERVICE, JAR_LIST_SERVICE, JAR_DETAIL_SERVICE, NOTE_LIST_SERVICE }
    public enum DatabaseOperation { CONNECTION_ACQUIRE, STATEMENT_PREPARE, STATEMENT_EXECUTE, BATCH_EXECUTE }
    private static final ThreadLocal<Attempt> CURRENT = new ThreadLocal<>();
    private static final int CAPACITY = 64;
    private final boolean enabled;
    private final boolean readEnabled;
    private final Supplier<JvmGcMetrics.Snapshot> gc;
    private final ArrayDeque<Sample> recent = new ArrayDeque<>();
    private final ArrayDeque<Sample> readRecent = new ArrayDeque<>();
    private final ArrayDeque<Sample> slowReads = new ArrayDeque<>();
    private static final int SLOW_CAPACITY = 32;
    private static final long SLOW_NANOS = 500_000_000L;
    private long readCompletedCount, readEvictedCount, slowEvictedCount;
    private final AtomicLong ids = new AtomicLong();

    public LoginDiagnostics(@Value("${app.monitoring.login-diagnostics-enabled:false}") boolean enabled) {
        this(enabled, JvmGcMetrics::read);
    }

    @Autowired
    public LoginDiagnostics(@Value("${app.monitoring.login-diagnostics-enabled:false}") boolean enabled,
                            @Value("${app.monitoring.read-diagnostics-enabled:false}") boolean readEnabled) {
        this(enabled, readEnabled, JvmGcMetrics::read);
    }

    LoginDiagnostics(boolean enabled, Supplier<JvmGcMetrics.Snapshot> gc) { this(enabled, false, gc); }

    LoginDiagnostics(boolean enabled, boolean readEnabled, Supplier<JvmGcMetrics.Snapshot> gc) {
        this.enabled = enabled; this.readEnabled = readEnabled; this.gc = gc;
    }

    /** ThreadLocal은 동기 로그인 한 요청에만 연결하고 반드시 finish에서 제거한다. */
    Attempt start() {
        return start(RequestKind.LOGIN);
    }

    /** 원문 URI 대신 고정 분류만 보존해 사용자 입력이 지표에 섞이지 않게 한다. */
    Attempt start(RequestKind requestKind) {
        if (requestKind == null || !(isRead(requestKind) ? readEnabled : enabled) || CURRENT.get() != null) return null;
        var attempt = new Attempt(ids.incrementAndGet(), safeGc(), requestKind);
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
                    delta(attempt.gcBefore, after, true), delta(attempt.gcBefore, after, false), attempt.requestKind,
                    Map.copyOf(attempt.database), copyDatabaseStages(attempt));
            synchronized (recent) {
                // 고빈도 조회가 로그인 기록을 밀어내지 않도록 저장 공간을 분리한다.
                if (isRead(attempt.requestKind)) {
                    readCompletedCount++;
                    if (readRecent.size() == CAPACITY) { readRecent.removeFirst(); readEvictedCount++; }
                    readRecent.addLast(sample);
                    if (elapsed >= SLOW_NANOS || !completed || status == null || status >= 400) {
                        if (slowReads.size() == SLOW_CAPACITY) { slowReads.removeFirst(); slowEvictedCount++; }
                        slowReads.addLast(sample);
                    }
                } else {
                    if (recent.size() == CAPACITY) recent.removeFirst();
                    recent.addLast(sample);
                }
            }
        } catch (RuntimeException unavailable) {
            // 부가 계측 실패가 인증 결과나 원래 예외를 바꾸지 않도록 한다.
        }
    }

    /** 고정 enum 구간만 허용한다. 공급자 반환값·예외 메시지는 저장하지 않고 그대로 호출자에게 전달한다. */
    public static <T> T measure(Stage stage, Supplier<T> operation) {
        var attempt = CURRENT.get();
        if (attempt == null) return operation.get();
        var parent = attempt.currentStage;
        attempt.currentStage = stage;
        long start = System.nanoTime();
        boolean completed = false;
        try {
            T value = operation.get();
            completed = true;
            return value;
        } finally {
            attempt.currentStage = parent;
            attempt.stages.put(stage, new Timing(System.nanoTime() - start, completed));
        }
    }

    public Snapshot snapshot() {
        synchronized (recent) {
            return new Snapshot(enabled, CAPACITY, List.copyOf(recent),
                    new ReadSnapshot(readEnabled, CAPACITY, SLOW_CAPACITY, SLOW_NANOS, readCompletedCount,
                            readEvictedCount, slowEvictedCount, List.copyOf(readRecent), List.copyOf(slowReads)));
        }
    }

    private static boolean isRead(RequestKind kind) { return kind != RequestKind.LOGIN && kind != RequestKind.CSRF; }

    /** Hibernate 콜백은 SQL·파라미터 없이 시간만 받는다. 요청 밖의 DB 작업은 기록하지 않는다. */
    static DatabaseMeasurement beginDatabaseOperation() {
        var attempt = CURRENT.get();
        return attempt == null ? null : new DatabaseMeasurement(attempt, System.nanoTime(), attempt.currentStage);
    }

    static void endDatabaseOperation(DatabaseOperation operation, DatabaseMeasurement measurement) {
        // 세션이 재사용되거나 비동기 스레드로 넘어가도 다른 요청에 시간을 섞지 않는다.
        if (measurement == null || CURRENT.get() != measurement.owner()) return;
        long elapsed = Math.max(0, System.nanoTime() - measurement.startedNanos());
        addDatabaseTiming(measurement.owner().database, operation, elapsed);
        // 인증의 세션 확인과 서비스의 DB 시간을 분리하되, 중첩 상위 구간에 중복 집계하지 않는다.
        if (measurement.stage() != null) {
            var stages = measurement.owner().databaseByStage;
            var timings = stages.computeIfAbsent(measurement.stage(), key -> new EnumMap<>(DatabaseOperation.class));
            addDatabaseTiming(timings, operation, elapsed);
        }
    }

    private static void addDatabaseTiming(Map<DatabaseOperation, DatabaseTiming> timings,
                                          DatabaseOperation operation, long elapsed) {
        var old = timings.get(operation);
        timings.put(operation, old == null ? new DatabaseTiming(1, elapsed, elapsed)
                : new DatabaseTiming(old.count() + 1, old.totalNanos() + elapsed, Math.max(old.maxNanos(), elapsed)));
    }

    private static Map<Stage, Map<DatabaseOperation, DatabaseTiming>> copyDatabaseStages(Attempt attempt) {
        var copy = new EnumMap<Stage, Map<DatabaseOperation, DatabaseTiming>>(Stage.class);
        attempt.databaseByStage.forEach((stage, timings) -> copy.put(stage, Map.copyOf(timings)));
        return Map.copyOf(copy);
    }

    record DatabaseMeasurement(Attempt owner, long startedNanos, Stage stage) { }
    public record DatabaseTiming(long count, long totalNanos, long maxNanos) { }

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
        final RequestKind requestKind;
        final EnumMap<Stage, Timing> stages = new EnumMap<>(Stage.class);
        final EnumMap<DatabaseOperation, DatabaseTiming> database = new EnumMap<>(DatabaseOperation.class);
        final EnumMap<Stage, Map<DatabaseOperation, DatabaseTiming>> databaseByStage = new EnumMap<>(Stage.class);
        Stage currentStage;
        Attempt(long id, JvmGcMetrics.Snapshot gcBefore, RequestKind requestKind) {
            this.id = id; this.gcBefore = gcBefore; this.requestKind = requestKind;
        }
    }

    public record Timing(long elapsedNanos, boolean completed) { }
    public record Sample(long diagnosticId, String startedAt, String completedAt, long elapsedNanos,
                         Integer responseStatus, boolean completed, Map<Stage, Timing> stages,
                         Long jvmGcCountDelta, Long jvmGcTimeMillisDelta, RequestKind requestKind,
                         Map<DatabaseOperation, DatabaseTiming> database,
                         Map<Stage, Map<DatabaseOperation, DatabaseTiming>> databaseByStage) { }
    public record ReadSnapshot(boolean enabled, int capacity, int slowCapacity, long slowThresholdNanos,
                               long completedCount, long recentEvictedCount, long slowEvictedCount,
                               List<Sample> recent, List<Sample> slow) { }
    public record Snapshot(boolean enabled, int capacity, List<Sample> recent, ReadSnapshot reads) { }
}
