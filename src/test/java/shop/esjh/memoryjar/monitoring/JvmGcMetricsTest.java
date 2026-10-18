package shop.esjh.memoryjar.monitoring;

import java.lang.management.GarbageCollectorMXBean;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** 실제 GC를 유발하지 않고 누적 수치·미지원 값의 표현을 검사한다. */
class JvmGcMetricsTest {
    @Test void readsCumulativeCountersOnly() {
        var bean = mock(GarbageCollectorMXBean.class);
        when(bean.getName()).thenReturn("test-collector");
        when(bean.getCollectionCount()).thenReturn(3L);
        when(bean.getCollectionTime()).thenReturn(7L);
        var snapshot = JvmGcMetrics.read(List.of(bean));
        assertThat(snapshot.totalCollectionCount()).isEqualTo(3);
        assertThat(snapshot.totalCollectionTimeMillis()).isEqualTo(7);
    }

    @Test void missingAndUnsupportedCountersAreNotReportedAsZero() {
        assertThat(JvmGcMetrics.read(List.of()).totalCollectionCount()).isNull();
        var bean = mock(GarbageCollectorMXBean.class);
        when(bean.getCollectionCount()).thenReturn(-1L);
        when(bean.getCollectionTime()).thenReturn(-1L);
        assertThat(JvmGcMetrics.read(List.of(bean)).totalCollectionTimeMillis()).isNull();
    }
}
