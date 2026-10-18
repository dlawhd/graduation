package shop.esjh.memoryjar.monitoring;

import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.util.List;

/** GC를 실행하지 않고 JVM이 이미 집계한 누적 횟수·시간만 읽는다. 미지원 값은 null이다. */
public final class JvmGcMetrics {
    private JvmGcMetrics() { }

    public static Snapshot read() { return read(ManagementFactory.getGarbageCollectorMXBeans()); }

    static Snapshot read(List<GarbageCollectorMXBean> beans) {
        var collectors = beans.stream().map(bean -> new Collector(bean.getName(),
                supported(bean.getCollectionCount()), supported(bean.getCollectionTime()))).toList();
        boolean known = !collectors.isEmpty() && collectors.stream()
                .allMatch(c -> c.collectionCount() != null && c.collectionTimeMillis() != null);
        return new Snapshot(collectors, known ? collectors.stream().mapToLong(Collector::collectionCount).sum() : null,
                known ? collectors.stream().mapToLong(Collector::collectionTimeMillis).sum() : null);
    }

    private static Long supported(long value) { return value >= 0 ? value : null; }

    public record Collector(String name, Long collectionCount, Long collectionTimeMillis) { }
    public record Snapshot(List<Collector> collectors, Long totalCollectionCount, Long totalCollectionTimeMillis) { }
}
