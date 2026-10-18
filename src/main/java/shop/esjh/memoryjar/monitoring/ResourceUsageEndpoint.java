package shop.esjh.memoryjar.monitoring;

import com.zaxxer.hikari.HikariDataSource;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import org.springframework.stereotype.Component;

/** DB 조회나 연결 생성 없이 현재 JVM Heap과 Hikari 풀의 관리 정보만 읽는다. */
@Component
@Endpoint(id = "resources")
public class ResourceUsageEndpoint {
    private final Map<String, DataSource> sources;
    private final MemoryMXBean memory;
    private final LoginDiagnostics loginDiagnostics;

    @Autowired
    public ResourceUsageEndpoint(Map<String, DataSource> sources, LoginDiagnostics loginDiagnostics) {
        this(sources, ManagementFactory.getMemoryMXBean(), loginDiagnostics);
    }

    ResourceUsageEndpoint(Map<String, DataSource> sources, MemoryMXBean memory) {
        this(sources, memory, new LoginDiagnostics(false));
    }

    ResourceUsageEndpoint(Map<String, DataSource> sources, MemoryMXBean memory, LoginDiagnostics loginDiagnostics) {
        this.sources = Map.copyOf(sources);
        this.memory = memory;
        this.loginDiagnostics = loginDiagnostics;
    }

    /** 값이 없으면 null/false로 반환한다. 미측정을 사용률 0%로 오해하지 않게 한다. */
    @ReadOperation
    public Snapshot read() {
        var usage = memory.getHeapMemoryUsage();
        var heap = new Heap(usage.getUsed(), usage.getCommitted(), usage.getMax(),
                percent(usage.getUsed(), usage.getMax()));
        var pools = sources.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .map(entry -> pool(entry.getKey(), entry.getValue())).toList();
        boolean measurable = heap.maxBytes() > 0 && !pools.isEmpty()
                && pools.stream().allMatch(pool -> pool.initialized() && pool.maxConnections() > 0);
        return new Snapshot(Instant.now().toString(), measurable, heap, pools,
                JvmGcMetrics.read(), loginDiagnostics.snapshot());
    }

    private Pool pool(String beanName, DataSource source) {
        // 알 수 없는 DataSource를 unwrap/getConnection으로 건드리지 않고 미측정으로 표시한다.
        if (!(source instanceof HikariDataSource hikari)) {
            return new Pool(beanName, false, null, null, null, null, null, null);
        }
        var stats = hikari.getHikariPoolMXBean();
        int max = hikari.getMaximumPoolSize();
        if (stats == null) return new Pool(beanName, false, max, null, null, null, null, null);
        int active = stats.getActiveConnections();
        // 이 카운터들은 순서대로 읽는 순간값이며 합계가 원자적으로 고정된 스냅샷은 아니다.
        return new Pool(beanName, true, max, active, stats.getIdleConnections(),
                stats.getTotalConnections(), stats.getThreadsAwaitingConnection(), percent(active, max));
    }

    private static Double percent(long used, long max) { return max > 0 ? used * 100.0 / max : null; }

    public record Snapshot(String observedAt, boolean measurable, Heap heap, List<Pool> pools,
                           JvmGcMetrics.Snapshot gc, LoginDiagnostics.Snapshot loginDiagnostics) { }
    public record Heap(long usedBytes, long committedBytes, long maxBytes, Double usedPercent) { }
    public record Pool(String name, boolean initialized, Integer maxConnections, Integer activeConnections,
                       Integer idleConnections, Integer totalConnections, Integer pendingRequests, Double usedPercent) { }
}
