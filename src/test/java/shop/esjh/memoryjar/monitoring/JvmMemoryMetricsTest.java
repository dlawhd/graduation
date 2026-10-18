package shop.esjh.memoryjar.monitoring;

import java.lang.management.BufferPoolMXBean;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryType;
import java.lang.management.MemoryUsage;
import java.lang.management.ThreadMXBean;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** 관리 빈의 집계값·미지원 상태만 읽고 GC나 민감한 스레드 정보를 요청하지 않는지 검사한다. */
class JvmMemoryMetricsTest {
    @Test void readsNonHeapPoolsBuffersAndThreadCountsWithoutDumpOrGc() {
        var memory = mock(MemoryMXBean.class);
        when(memory.getNonHeapMemoryUsage()).thenReturn(new MemoryUsage(-1, 12, 24, -1));
        var threads = mock(ThreadMXBean.class);
        when(threads.getThreadCount()).thenReturn(53);
        when(threads.getDaemonThreadCount()).thenReturn(20);
        when(threads.getPeakThreadCount()).thenReturn(60);
        when(threads.getTotalStartedThreadCount()).thenReturn(100L);
        var pool = mock(MemoryPoolMXBean.class);
        when(pool.getName()).thenReturn("Metaspace");
        when(pool.getType()).thenReturn(MemoryType.NON_HEAP);
        when(pool.isValid()).thenReturn(true);
        when(pool.getUsage()).thenReturn(new MemoryUsage(-1, 10, 20, -1));
        var buffer = mock(BufferPoolMXBean.class);
        when(buffer.getName()).thenReturn("direct");
        when(buffer.getCount()).thenReturn(2L);
        when(buffer.getMemoryUsed()).thenReturn(30L);
        when(buffer.getTotalCapacity()).thenReturn(25L);
        var result = JvmMemoryMetrics.read(memory, threads, List.of(pool), List.of(buffer));
        assertThat(result.nonHeap().usedBytes()).isEqualTo(12L);
        assertThat(result.nonHeap().maxBytes()).isNull();
        assertThat(result.memoryPools().get(0).usage().committedBytes()).isEqualTo(20L);
        assertThat(result.bufferPools().get(0).memoryUsedBytes()).isEqualTo(30L);
        assertThat(result.bufferPools().get(0).totalCapacityBytes()).isEqualTo(25L);
        assertThat(result.threads().liveCount()).isEqualTo(53);
        assertThat(result.threads().totalStartedCount()).isEqualTo(100);
        verify(memory, never()).gc();
        verify(threads, never()).dumpAllThreads(anyBoolean(), anyBoolean());
        verify(threads, never()).getAllThreadIds();
    }

    @Test void invalidPoolsAndUnsupportedBufferCountersAreNotZero() {
        var memory = mock(MemoryMXBean.class);
        var threads = mock(ThreadMXBean.class);
        var pool = mock(MemoryPoolMXBean.class);
        when(pool.getName()).thenReturn("removed");
        when(pool.getType()).thenReturn(MemoryType.HEAP);
        when(pool.isValid()).thenReturn(false);
        var buffer = mock(BufferPoolMXBean.class);
        when(buffer.getName()).thenReturn("direct");
        when(buffer.getCount()).thenReturn(-1L);
        when(buffer.getMemoryUsed()).thenReturn(-1L);
        when(buffer.getTotalCapacity()).thenReturn(-1L);
        var result = JvmMemoryMetrics.read(memory, threads, List.of(pool), List.of(buffer));
        assertThat(result.nonHeap()).isNull();
        assertThat(result.memoryPools().get(0).usage()).isNull();
        assertThat(result.bufferPools().get(0).count()).isNull();
        assertThat(result.bufferPools().get(0).memoryUsedBytes()).isNull();
        assertThat(result.bufferPools().get(0).totalCapacityBytes()).isNull();
        verify(pool, never()).getUsage();
    }

    @Test void readsPlatformBeansAndKeepsMissingListsEmpty() {
        var result = JvmMemoryMetrics.read();
        assertThat(result.nonHeap()).isNotNull();
        assertThat(result.memoryPools()).isNotEmpty();
        assertThat(result.threads().liveCount()).isPositive();
        var empty = JvmMemoryMetrics.read(mock(MemoryMXBean.class), mock(ThreadMXBean.class), List.of(), List.of());
        assertThat(empty.memoryPools()).isEmpty();
        assertThat(empty.bufferPools()).isEmpty();
    }
}
