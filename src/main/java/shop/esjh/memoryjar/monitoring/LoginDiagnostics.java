package shop.esjh.memoryjar.monitoring;

import java.io.IOException;
import java.util.ArrayList;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/** 명시적으로 켠 로그인·CSRF 요청만 시간 구간으로 측정한다. 입력값·사용자·토큰·예외 원문은 받지 않는다. */
@Component
public class LoginDiagnostics {
    public enum RequestKind { LOGIN, CSRF, ME, JAR_LIST, JAR_DETAIL, NOTE_LIST, TEXTURE_IMAGE, TEXTURE_BODY }
    public enum Stage { CREDENTIAL_LOOKUP, PASSWORD_VERIFY, AUTH_SERVICE, REFRESH_TRANSACTION, JWT_CREATE, COOKIE_WRITE,
        JWT_VALIDATE, JWT_CLAIMS_PARSE, SESSION_VERSION_QUERY, CSRF_CONTROLLER,
        ME_SERVICE, JAR_LIST_SERVICE, JAR_DETAIL_SERVICE, NOTE_LIST_SERVICE,
        TEXTURE_DB, TEXTURE_MEMBER_LOOKUP, TEXTURE_DESIGN_LOOKUP, TEXTURE_S3_OPEN, TEXTURE_S3_READ,
        TEXTURE_CACHE_HIT, TEXTURE_CACHE_MISS, TEXTURE_CACHE_WAIT, TEXTURE_CACHE_BYPASS, TEXTURE_S3_REQUEST_BUILD }
    public enum S3SdkDuration { API_CALL, CREDENTIALS_FETCH, TOKEN_FETCH, ENDPOINT_RESOLVE, MARSHALLING,
        SIGNING, SERVICE_CALL, UNMARSHALLING, TIME_TO_FIRST_BYTE, TIME_TO_LAST_BYTE, CONNECTION_ACQUIRE, BACKOFF_DELAY,
        HTTP_CONNECT, HTTP_TLS_UPGRADE, HTTP_SEND, HTTP_RECEIVE_HEADERS,
        HTTP_DNS, HTTP_SOCKET_CREATE, HTTP_TCP_CONNECT, HTTP_TLS_SOCKET_CREATE, HTTP_TLS_HANDSHAKE, HTTP_TLS_HOSTNAME_VERIFY,
        SDK_CALL_ENTRY, SDK_BEFORE_MARSHALLING, SDK_MARSHALLING_PIPELINE, SDK_PRE_TRANSMISSION,
        SDK_POST_TRANSMISSION, SDK_UNMARSHALLING_PIPELINE, SDK_AFTER_UNMARSHALLING, SDK_RETURN, SDK_GET_OBJECT }
    public enum S3SdkCounter { RETRY_COUNT, MAX_CONCURRENCY, AVAILABLE_CONCURRENCY, LEASED_CONCURRENCY, PENDING_CONCURRENCY_ACQUIRES,
        HTTP_TRANSPORT_OBSERVER, HTTP_TRANSPORT_FAILURE, HTTP_SOCKET_OBSERVER,
        SDK_PHASE_OBSERVER, SDK_PHASE_INCOMPLETE }
    public enum DatabaseOperation { CONNECTION_ACQUIRE, STATEMENT_PREPARE, STATEMENT_EXECUTE, BATCH_EXECUTE }
    private static final ThreadLocal<Attempt> CURRENT = new ThreadLocal<>();
    private static final int CAPACITY = 64;
    private final boolean enabled;
    private final boolean readEnabled;
    private final boolean textureEnabled;
    private final Supplier<JvmGcMetrics.Snapshot> gc;
    private final ArrayDeque<Sample> recent = new ArrayDeque<>();
    private final ArrayDeque<Sample> readRecent = new ArrayDeque<>();
    private final ArrayDeque<Sample> slowReads = new ArrayDeque<>();
    private final ArrayDeque<Sample> textureRecent = new ArrayDeque<>();
    private static final int SLOW_CAPACITY = 32;
    private static final long SLOW_NANOS = 500_000_000L;
    private long readCompletedCount, readEvictedCount, slowEvictedCount;
    private long textureCompletedCount, textureEvictedCount;
    private final AtomicLong ids = new AtomicLong();

    public LoginDiagnostics(@Value("${app.monitoring.login-diagnostics-enabled:false}") boolean enabled) {
        this(enabled, JvmGcMetrics::read);
    }

    public LoginDiagnostics(@Value("${app.monitoring.login-diagnostics-enabled:false}") boolean enabled,
                            @Value("${app.monitoring.read-diagnostics-enabled:false}") boolean readEnabled) {
        this(enabled, readEnabled, JvmGcMetrics::read);
    }

    /** 설정이 실수로 운영에 전달돼도 사진 계측은 local 단독 계열 프로필에서만 켜진다. */
    @Autowired
    public LoginDiagnostics(@Value("${app.monitoring.login-diagnostics-enabled:false}") boolean enabled,
                            @Value("${app.monitoring.read-diagnostics-enabled:false}") boolean readEnabled,
                            @Value("${app.monitoring.texture-diagnostics-enabled:false}") boolean textureEnabled,
                            Environment environment) {
        this(enabled, readEnabled, textureEnabled && environment.acceptsProfiles(Profiles.of("local & !prod")),
                JvmGcMetrics::read);
    }

    LoginDiagnostics(boolean enabled, Supplier<JvmGcMetrics.Snapshot> gc) { this(enabled, false, gc); }

    LoginDiagnostics(boolean enabled, boolean readEnabled, Supplier<JvmGcMetrics.Snapshot> gc) {
        this(enabled, readEnabled, false, gc);
    }

    LoginDiagnostics(boolean enabled, boolean readEnabled, boolean textureEnabled, Supplier<JvmGcMetrics.Snapshot> gc) {
        this.enabled = enabled; this.readEnabled = readEnabled; this.textureEnabled = textureEnabled; this.gc = gc;
    }

    /** ThreadLocal은 동기 로그인 한 요청에만 연결하고 반드시 finish에서 제거한다. */
    Attempt start() {
        return start(RequestKind.LOGIN);
    }

    /** 원문 URI 대신 고정 분류만 보존해 사용자 입력이 지표에 섞이지 않게 한다. */
    Attempt start(RequestKind requestKind) {
        if (requestKind == null || !(isTexture(requestKind) ? textureEnabled : isRead(requestKind) ? readEnabled : enabled)
                || CURRENT.get() != null) return null;
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
                    Map.copyOf(attempt.database), copyDatabaseStages(attempt), copyS3Sdk(attempt));
            synchronized (recent) {
                // 고빈도 조회가 로그인 기록을 밀어내지 않도록 저장 공간을 분리한다.
                if (isTexture(attempt.requestKind)) {
                    // 사진 읽기가 다른 조회 기록을 밀어내지 않으며 원본 사진·경로·키·사용자 ID는 보관하지 않는다.
                    textureCompletedCount++;
                    if (textureRecent.size() == CAPACITY) { textureRecent.removeFirst(); textureEvictedCount++; }
                    textureRecent.addLast(sample);
                } else if (isRead(attempt.requestKind)) {
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

    /** 이미지 스트림의 IOException을 바꾸지 않고 성공/실패와 읽기 시간만 보존한다. */
    public static <T> T measureIo(Stage stage, IoSupplier<T> operation) throws IOException {
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

    @FunctionalInterface
    public interface IoSupplier<T> { T get() throws IOException; }

    public Snapshot snapshot() {
        synchronized (recent) {
            return new Snapshot(enabled, CAPACITY, List.copyOf(recent),
                    new ReadSnapshot(readEnabled, CAPACITY, SLOW_CAPACITY, SLOW_NANOS, readCompletedCount,
                            readEvictedCount, slowEvictedCount, List.copyOf(readRecent), List.copyOf(slowReads)),
                    new TextureSnapshot(textureEnabled, CAPACITY, textureCompletedCount, textureEvictedCount,
                            List.copyOf(textureRecent)));
        }
    }

    private static boolean isTexture(RequestKind kind) { return kind == RequestKind.TEXTURE_IMAGE || kind == RequestKind.TEXTURE_BODY; }
    private static boolean isRead(RequestKind kind) { return kind != RequestKind.LOGIN && kind != RequestKind.CSRF && !isTexture(kind); }

    /** 로컬 이미지 진단 요청만 SDK 관찰자를 붙일 수 있다. 다른 요청/운영 환경은 null로 즉시 우회한다. */
    static Attempt textureSdkOwner() {
        var attempt = CURRENT.get();
        return attempt != null && isTexture(attempt.requestKind) ? attempt : null;
    }

    static boolean ownsTextureSdk(Attempt owner) { return owner != null && CURRENT.get() == owner; }

    /** S3 설정도 같은 local/!prod 판정을 사용해 운영 클라이언트에 내부 관찰자를 설치하지 않는다. */
    public boolean textureDiagnosticsEnabled() { return textureEnabled; }

    /** 숫자 기록 실패가 원래 HTTP 성공/예외를 바꾸지 않게 부가 관찰만 격리한다. */
    static void recordTransport(Attempt owner, S3SdkDuration metric, long startedNanos, boolean completed) {
        if (!ownsTextureSdk(owner)) return;
        try {
            recordS3Duration(owner, metric, Math.max(0, System.nanoTime() - startedNanos));
            if (!completed) recordS3Counter(owner, S3SdkCounter.HTTP_TRANSPORT_FAILURE, 1);
        } catch (RuntimeException unavailable) { owner.s3Truncated = true; }
    }

    /** SDK의 원문 MetricCollection은 저장하지 않고 고정 enum과 비음수 숫자만 복사한다. */
    static void recordS3Duration(Attempt owner, S3SdkDuration metric, long nanos) {
        if (!ownsTextureSdk(owner) || nanos < 0) return;
        var old = owner.s3Durations.get(metric);
        owner.s3Durations.put(metric, old == null ? new SdkDuration(1, nanos, nanos)
                : new SdkDuration(old.count() + 1, Math.addExact(old.totalNanos(), nanos), Math.max(old.maxNanos(), nanos)));
    }

    /** 지원되는 현재 스레드 CPU 시간만 받는다. 경과 시간과 다르며 미지원 값을 0으로 채우지 않는다. */
    static void recordS3CpuDuration(Attempt owner, S3SdkDuration metric, long nanos) {
        if (!ownsTextureSdk(owner) || nanos < 0) return;
        var old = owner.s3CpuDurations.get(metric);
        owner.s3CpuDurations.put(metric, old == null ? new SdkDuration(1, nanos, nanos)
                : new SdkDuration(old.count() + 1, Math.addExact(old.totalNanos(), nanos), Math.max(old.maxNanos(), nanos)));
    }

    static void recordS3Counter(Attempt owner, S3SdkCounter metric, int value) {
        if (!ownsTextureSdk(owner) || value < 0) return;
        var values = owner.s3Counters.computeIfAbsent(metric, ignored -> new ArrayList<>());
        if (values.size() < 32) values.add(value); else owner.s3Truncated = true;
    }

    private static S3SdkSnapshot copyS3Sdk(Attempt attempt) {
        var counters = new EnumMap<S3SdkCounter, List<Integer>>(S3SdkCounter.class);
        attempt.s3Counters.forEach((key, values) -> counters.put(key, List.copyOf(values)));
        return new S3SdkSnapshot(attempt.s3Publications, attempt.s3Truncated, Map.copyOf(attempt.s3Durations),
                Map.copyOf(counters), Map.copyOf(attempt.s3CpuDurations));
    }

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
        final EnumMap<S3SdkDuration, SdkDuration> s3Durations = new EnumMap<>(S3SdkDuration.class);
        final EnumMap<S3SdkDuration, SdkDuration> s3CpuDurations = new EnumMap<>(S3SdkDuration.class);
        final EnumMap<S3SdkCounter, List<Integer>> s3Counters = new EnumMap<>(S3SdkCounter.class);
        int s3Publications;
        boolean s3Truncated;
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
                         Map<Stage, Map<DatabaseOperation, DatabaseTiming>> databaseByStage, S3SdkSnapshot s3Sdk) { }
    public record SdkDuration(long count, long totalNanos, long maxNanos) { }
    public record S3SdkSnapshot(int publications, boolean truncated, Map<S3SdkDuration, SdkDuration> durations,
                                Map<S3SdkCounter, List<Integer>> counters, Map<S3SdkDuration, SdkDuration> cpuDurations) { }
    public record ReadSnapshot(boolean enabled, int capacity, int slowCapacity, long slowThresholdNanos,
                               long completedCount, long recentEvictedCount, long slowEvictedCount,
                               List<Sample> recent, List<Sample> slow) { }
    public record TextureSnapshot(boolean enabled, int capacity, long completedCount, long evictedCount, List<Sample> recent) { }
    public record Snapshot(boolean enabled, int capacity, List<Sample> recent, ReadSnapshot reads, TextureSnapshot textures) { }
}
