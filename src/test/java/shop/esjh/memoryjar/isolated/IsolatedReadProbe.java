package shop.esjh.memoryjar.isolated;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import jakarta.persistence.EntityManagerFactory;
import java.io.BufferedWriter;
import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadPoolExecutor;
import jdk.jfr.Recording;
import jdk.jfr.consumer.RecordedThread;
import jdk.jfr.consumer.RecordingFile;
import org.hibernate.SessionFactory;
import org.springframework.boot.web.embedded.tomcat.TomcatWebServer;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import shop.esjh.memoryjar.monitoring.ResourceUsageEndpoint;

/** 격리 시험 JVM에서만 단계별 DB 풀·GC·SQL 수·CPU 제한·실행 스택을 관찰한다. 요청 본문·토큰은 읽지 않는다. */
final class IsolatedReadProbe implements AutoCloseable {
    private final ObjectMapper json;
    private final ResourceUsageEndpoint resources;
    private final SessionFactory sessions;
    private final ServletWebServerApplicationContext context;
    private final Thread sampler;
    private volatile boolean closed;
    private volatile Throwable failure;
    private Recording recording;
    private String phase;
    private BufferedWriter writer;
    private final HikariDataSource dataSource;
    private final int originalPoolMax;
    private long commandSequence = 1;

    IsolatedReadProbe(ObjectMapper json, ResourceUsageEndpoint resources, EntityManagerFactory emf,
                      ServletWebServerApplicationContext context) {
        if (!"1".equals(System.getenv("ISOLATED_READ_PROBE")) || !"1".equals(System.getenv("ISOLATED_E2E")))
            throw new IllegalStateException("Probe requires isolated test flags");
        this.json = json; this.resources = resources; this.sessions = emf.unwrap(SessionFactory.class); this.context = context;
        this.dataSource = (HikariDataSource) context.getBean(DataSource.class);
        this.originalPoolMax = dataSource.getMaximumPoolSize();
        sampler = new Thread(this::sampleLoop, "isolated-read-probe");
        sampler.setDaemon(true); sampler.start();
    }

    /** 제어 파일에는 고정된 단계명만 허용하고 외부 URL이나 SQL을 받지 않는다. */
    private void sampleLoop() {
        try {
            while (!closed) {
                Path control = Path.of(String.format("/results/probe-command-%05d.json", commandSequence));
                var command = readControl(json, control);
                if (command != null) {
                    String next = command.path("phase").asText();
                    if (!safePhase(next)) throw new IllegalArgumentException("Invalid probe phase");
                    if (command.path("active").asBoolean()) {
                        if (!next.equals(phase)) {
                            stopPhase(); configureTestPool(command.path("poolSize").asInt(10)); startPhase(next);
                        }
                    } else if (next.equals(phase)) {
                        stopPhase(); acknowledge(next, false);
                    }
                    commandSequence++;
                }
                if (phase != null) snapshot();
                Thread.sleep(1000);
            }
        } catch (Throwable error) {
            failure = error;
            try { Files.writeString(Path.of("/results/probe-error.json"),
                    json.writeValueAsString(Map.of("errorType", error.getClass().getSimpleName()))); }
            catch (Exception ignored) { /* 원래 계측 실패는 close에서 다시 전달한다. */ }
        }
        finally {
            try { stopPhase(); } catch (Exception error) { if (failure == null) failure = error; }
        }
    }

    static boolean safePhase(String value) { return value != null && value.matches("[a-z][a-z0-9-]{0,39}"); }

    /** 아직 도착하지 않은 파일은 재시도한다. 단계마다 새 파일만 사용하므로 교체 중 사라지는 경로가 없다. */
    static com.fasterxml.jackson.databind.JsonNode readControl(ObjectMapper mapper, Path file) throws Exception {
        try { return mapper.readTree(Files.readString(file)); }
        catch (java.nio.file.NoSuchFileException notYetWritten) { return null; }
    }

    /** 원인 분리용 격리 풀만 10/20으로 제한해 바꾸고 기존 연결이 정리될 때까지 기다린다. 운영 설정은 수정하지 않는다. */
    private void configureTestPool(int size) throws Exception {
        if (size != 10 && size != 20) throw new IllegalArgumentException("Unexpected isolated pool size");
        if (dataSource.getMaximumPoolSize() == size) return;
        dataSource.setMaximumPoolSize(size);
        dataSource.getHikariPoolMXBean().softEvictConnections();
        long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
        while (dataSource.getHikariPoolMXBean().getActiveConnections() > 0
                || dataSource.getHikariPoolMXBean().getTotalConnections() > size
                || dataSource.getHikariPoolMXBean().getIdleConnections() < 10) {
            if (System.nanoTime() > deadline) throw new IllegalStateException("Isolated pool resize did not settle");
            Thread.sleep(100);
        }
    }

    /** 기본 JFR 설정을 비우고 메서드 실행·대기·GC 지표만 켠다. 시스템 속성·환경변수·본문은 수집하지 않는다. */
    private void startPhase(String name) throws Exception {
        phase = name;
        writer = Files.newBufferedWriter(Path.of("/results/probe-" + phase + ".jsonl"));
        recording = new Recording(); recording.setSettings(Map.of());
        recording.setMaxSize(32L * 1024 * 1024);
        recording.enable("jdk.ExecutionSample").withPeriod(Duration.ofMillis(20));
        recording.enable("jdk.NativeMethodSample").withPeriod(Duration.ofMillis(20));
        recording.enable("jdk.GarbageCollection"); recording.enable("jdk.GCPhasePause");
        recording.enable("jdk.CPULoad").withPeriod(Duration.ofSeconds(1));
        // 객체 값은 수집하지 않는다. 할당 표본의 클래스·가중 바이트·호출 경로로 메모리 사용 후보를 찾는다.
        recording.enable("jdk.ObjectAllocationSample").with("throttle", "150/s").withStackTrace();
        for (String event : List.of("jdk.ThreadPark", "jdk.JavaMonitorEnter", "jdk.SocketRead"))
            recording.enable(event).withThreshold(Duration.ofMillis(20)).withStackTrace();
        recording.start(); snapshot(); acknowledge(name, true);
    }

    private void acknowledge(String name, boolean active) throws Exception {
        String value = json.writeValueAsString(Map.of("phase", name, "active", active));
        Path ack = Path.of(String.format("/results/probe-ack-%05d.json", commandSequence));
        Files.writeString(Path.of(ack + ".partial"), value);
        Files.move(Path.of(ack + ".partial"), ack);
        Path target = Path.of("/results/probe-state.json");
        Files.writeString(Path.of(target + ".partial"), value);
        Files.move(Path.of(target + ".partial"), target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }

    /** 이미 존재하는 관리 빈과 메모리 카운터만 읽는다. DB 쿼리·강제 GC·인증 정책 변경을 하지 않는다. */
    private void snapshot() throws Exception {
        if (writer == null) return;
        var values = new LinkedHashMap<String, Object>();
        values.put("phase", phase); values.put("observedAt", Instant.now().toString());
        values.put("resources", resources.read());
        var stats = sessions.getStatistics();
        values.put("hibernate", Map.of("enabled", stats.isStatisticsEnabled(), "statements", stats.getPrepareStatementCount(),
                "queries", stats.getQueryExecutionCount(), "entityLoads", stats.getEntityLoadCount(),
                "entityFetches", stats.getEntityFetchCount(), "collectionFetches", stats.getCollectionFetchCount(),
                "transactions", stats.getTransactionCount(), "connections", stats.getConnectCount()));
        var server = (TomcatWebServer) context.getWebServer();
        var executor = server.getTomcat().getConnector().getProtocolHandler().getExecutor();
        values.put("tomcat", executor instanceof ThreadPoolExecutor pool ? Map.of(
                "measurable", true, "active", pool.getActiveCount(), "poolSize", pool.getPoolSize(),
                "maxThreads", pool.getMaximumPoolSize(), "queued", pool.getQueue().size(), "completed", pool.getCompletedTaskCount())
                : executor instanceof org.apache.tomcat.util.threads.ThreadPoolExecutor pool ? Map.of(
                "measurable", true, "active", pool.getActiveCount(), "poolSize", pool.getPoolSize(),
                "maxThreads", pool.getMaximumPoolSize(), "queued", pool.getQueue().size(), "completed", pool.getCompletedTaskCount())
                : Map.of("measurable", false));
        values.put("cgroupCpu", cpuStats());
        var os = (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
        values.put("processCpuTimeNanos", os.getProcessCpuTime());
        writer.write(json.writeValueAsString(values)); writer.newLine(); writer.flush();
    }

    static Map<String, Long> cpuStats() throws Exception {
        boolean unified = Files.exists(Path.of("/sys/fs/cgroup/cpu.stat"));
        Path stat = Path.of(unified ? "/sys/fs/cgroup/cpu.stat" : "/sys/fs/cgroup/cpu/cpu.stat");
        String usage = unified ? null : Files.readString(Path.of("/sys/fs/cgroup/cpuacct/cpuacct.usage"));
        return normalizeCpuStats(Files.readAllLines(stat), usage);
    }

    /** cgroup v1의 나노초 값을 v2와 같은 마이크로초로 바꿔 버전 차이를 성능 차이로 오해하지 않게 한다. */
    static Map<String, Long> normalizeCpuStats(List<String> lines, String usageNanos) {
        var values = new LinkedHashMap<String, Long>();
        for (String line : lines) {
            String[] pair = line.split("\\s+");
            if (pair.length == 2) values.put(pair[0], Long.parseLong(pair[1]));
        }
        if (values.containsKey("throttled_time")) values.put("throttled_usec", values.remove("throttled_time") / 1000);
        if (usageNanos != null) values.put("usage_usec", Long.parseLong(usageNanos.trim()) / 1000);
        return values;
    }

    private void stopPhase() throws Exception {
        if (phase == null) return;
        snapshot(); writer.close(); writer = null;
        recording.stop();
        Path file = Path.of("/results/probe-" + phase + ".jfr");
        recording.dump(file); recording.close(); recording = null;
        String finishedPhase = phase;
        phase = null;
        summarizeRecording(json, file, Path.of("/results/probe-" + finishedPhase + "-stacks.json"));
    }

    static boolean isHttpThreadName(String name) {
        return name != null && name.matches("http-nio-(?:0\\.0\\.0\\.0-)?8080-exec-[0-9]+");
    }

    /** JFR 원본에서 메서드명·집계 시간만 추린다. 원본 이벤트의 임의 필드나 문자열을 보고서에 복사하지 않는다. */
    static void summarizeRecording(ObjectMapper json, Path file, Path output) throws Exception {
        var counts = new HashMap<String, Long>();
        var leaves = new HashMap<String, Long>();
        var appFrames = new HashMap<String, Long>();
        var javaLeaves = new HashMap<String, Long>();
        var javaAppFrames = new HashMap<String, Long>();
        var nativeLeaves = new HashMap<String, Long>();
        var waits = new HashMap<String, Long>();
        var pauses = new ArrayList<Double>();
        var allocationClasses = new HashMap<String, Long>();
        var allocationAppFrames = new HashMap<String, Long>();
        long allocationSamples = 0, allocationWeightBytes = 0;
        long executionSamples = 0, httpSamples = 0, httpJavaSamples = 0;
        try (var input = new RecordingFile(file)) {
            while (input.hasMoreEvents()) {
                var event = input.readEvent();
                String type = event.getEventType().getName();
                counts.merge(type, 1L, Long::sum);
                if (type.equals("jdk.GCPhasePause")) pauses.add(event.getDuration().toNanos() / 1e6);
                boolean execution = type.equals("jdk.ExecutionSample") || type.equals("jdk.NativeMethodSample");
                if (execution) executionSamples++;
                RecordedThread thread = event.hasField("sampledThread") ? event.getThread("sampledThread")
                        : event.hasField("eventThread") ? event.getThread() : null;
                // JVM 네이티브 스레드는 Java 이름이 없을 수 있으므로 요청 작업자만 명시적으로 고른다.
                if (thread == null || !isHttpThreadName(thread.getJavaName())) continue;
                var stack = event.getStackTrace();
                if (stack == null || stack.getFrames().isEmpty()) continue;
                var frames = stack.getFrames().stream().filter(f -> f.isJavaFrame() && f.getMethod() != null).toList();
                if (frames.isEmpty()) continue;
                String leaf = frames.get(0).getMethod().getType().getName() + "." + frames.get(0).getMethod().getName();
                if (type.equals("jdk.ObjectAllocationSample")) {
                    // weight는 표본이 대표하는 할당량의 추정치다. 전체 객체의 정확한 크기 합계로 발표하지 않는다.
                    long weight = event.getLong("weight");
                    allocationSamples++; allocationWeightBytes += weight;
                    allocationClasses.merge(event.getClass("objectClass").getName(), weight, Long::sum);
                    var seen = new java.util.HashSet<String>();
                    for (var frame : frames) {
                        String name = frame.getMethod().getType().getName() + "." + frame.getMethod().getName();
                        if (name.startsWith("shop.esjh.memoryjar.") && seen.add(name))
                            allocationAppFrames.merge(name, weight, Long::sum);
                    }
                }
                if (execution) {
                    httpSamples++; leaves.merge(leaf, 1L, Long::sum);
                    boolean javaExecution = type.equals("jdk.ExecutionSample");
                    if (javaExecution) { httpJavaSamples++; javaLeaves.merge(leaf, 1L, Long::sum); }
                    else nativeLeaves.merge(leaf, 1L, Long::sum);
                    var seen = new java.util.HashSet<String>();
                    for (var frame : frames) {
                        String name = frame.getMethod().getType().getName() + "." + frame.getMethod().getName();
                        if (name.startsWith("shop.esjh.memoryjar.") && seen.add(name)) {
                            appFrames.merge(name, 1L, Long::sum);
                            if (javaExecution) javaAppFrames.merge(name, 1L, Long::sum);
                        }
                    }
                } else if (List.of("jdk.ThreadPark", "jdk.JavaMonitorEnter", "jdk.SocketRead").contains(type)) {
                    String category = frames.stream().map(f -> f.getMethod().getType().getName())
                            .anyMatch(n -> n.startsWith("com.zaxxer.hikari.")) ? "hikari" : type.equals("jdk.SocketRead") ? "socketRead" : "other";
                    waits.merge(type + ":" + category, event.getDuration().toNanos(), Long::sum);
                }
            }
        }
        pauses.sort(Double::compare);
        var summary = new LinkedHashMap<String, Object>();
        summary.put("eventCounts", counts); summary.put("executionSamples", executionSamples);
        summary.put("httpAllocationSamples", allocationSamples);
        summary.put("httpAllocationWeightBytes", allocationWeightBytes);
        summary.put("allocationClassWeightBytes", allocationClasses);
        summary.put("allocationAppFrameWeightBytes", allocationAppFrames);
        summary.put("httpExecutionSamples", httpSamples); summary.put("httpJavaExecutionSamples", httpJavaSamples);
        summary.put("topHttpLeafFrames", top(leaves)); summary.put("inclusiveApplicationFrames", top(appFrames));
        summary.put("topHttpJavaLeafFrames", top(javaLeaves)); summary.put("inclusiveJavaApplicationFrames", top(javaAppFrames));
        summary.put("topHttpNativeLeafFrames", top(nativeLeaves)); summary.put("httpWaitNanos", waits);
        summary.put("gcPauseCount", pauses.size()); summary.put("gcPauseMaxMs", pauses.isEmpty() ? 0 : pauses.get(pauses.size()-1));
        summary.put("gcPauseTotalMs", pauses.stream().mapToDouble(Double::doubleValue).sum());
        json.writeValue(output.toFile(), summary);
    }

    private static List<Map<String, Object>> top(Map<String, Long> values) {
        return values.entrySet().stream().sorted(Map.Entry.<String, Long>comparingByValue().reversed()).limit(30)
                .map(e -> Map.<String, Object>of("method", e.getKey(), "samples", e.getValue())).toList();
    }

    @Override public void close() throws Exception {
        closed = true; sampler.join(30000);
        dataSource.setMaximumPoolSize(originalPoolMax);
        if (sampler.isAlive()) throw new IllegalStateException("Read probe did not finish");
        if (failure != null) throw new IllegalStateException("Read probe failed", failure);
    }
}
