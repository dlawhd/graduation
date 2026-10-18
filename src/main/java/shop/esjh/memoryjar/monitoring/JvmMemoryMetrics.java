package shop.esjh.memoryjar.monitoring;

import java.lang.management.BufferPoolMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryUsage;
import java.lang.management.ThreadMXBean;
import java.util.Comparator;
import java.util.List;

/** Heap 외 JVM 메모리·버퍼·스레드의 집계값을 읽는다. 덤프·GC·스레드별 정보는 수집하지 않는다. */
public final class JvmMemoryMetrics {
    private JvmMemoryMetrics() { }

    /** JVM 기본 관리 빈만 사용한다. DB 연결·외부 통신·진단 에이전트 설치가 필요하지 않다. */
    public static Snapshot read() {
        return read(ManagementFactory.getMemoryMXBean(), ManagementFactory.getThreadMXBean(),
                ManagementFactory.getMemoryPoolMXBeans(), ManagementFactory.getPlatformMXBeans(BufferPoolMXBean.class));
    }

    static Snapshot read(MemoryMXBean memory, ThreadMXBean threads,
                         List<MemoryPoolMXBean> memoryPools, List<BufferPoolMXBean> buffers) {
        var pools = memoryPools.stream().sorted(Comparator.comparing(MemoryPoolMXBean::getName))
                .map(bean -> new Pool(bean.getName(), bean.getType().name(),
                        usage(bean.isValid() ? bean.getUsage() : null))).toList();
        var bufferPools = buffers.stream().sorted(Comparator.comparing(BufferPoolMXBean::getName))
                .map(bean -> new Buffer(bean.getName(), supported(bean.getCount()),
                        supported(bean.getMemoryUsed()), supported(bean.getTotalCapacity()))).toList();
        // 각 카운터는 순차 조회한 순간값이다. OS RSS/스왑과 합산하거나 전체 네이티브 메모리로 해석하지 않는다.
        return new Snapshot(usage(memory.getNonHeapMemoryUsage()), pools, bufferPools,
                new Threads(threads.getThreadCount(), threads.getDaemonThreadCount(),
                        threads.getPeakThreadCount(), threads.getTotalStartedThreadCount()));
    }

    private static Usage usage(MemoryUsage value) {
        return value == null ? null : new Usage(supported(value.getUsed()), supported(value.getCommitted()),
                supported(value.getMax()));
    }

    private static Long supported(long value) { return value < 0 ? null : value; }

    public record Snapshot(Usage nonHeap, List<Pool> memoryPools, List<Buffer> bufferPools, Threads threads) { }
    public record Usage(Long usedBytes, Long committedBytes, Long maxBytes) { }
    public record Pool(String name, String type, Usage usage) { }
    public record Buffer(String name, Long count, Long memoryUsedBytes, Long totalCapacityBytes) { }
    public record Threads(int liveCount, int daemonCount, int peakCount, long totalStartedCount) { }
}
