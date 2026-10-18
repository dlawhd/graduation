package shop.esjh.memoryjar.monitoring;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** 실제 DB 연결을 만들지 않고 수치와 미측정 상태를 정확하게 반환하는지 검사한다. */
class ResourceUsageEndpointTest {
    @Test void readsHeapAndPoolWithoutBorrowingConnection() throws Exception {
        var memory = mock(MemoryMXBean.class);
        when(memory.getHeapMemoryUsage()).thenReturn(new MemoryUsage(-1, 128, 256, 512));
        var source = mock(HikariDataSource.class);
        var pool = mock(HikariPoolMXBean.class);
        when(source.getHikariPoolMXBean()).thenReturn(pool);
        when(source.getMaximumPoolSize()).thenReturn(10);
        when(pool.getActiveConnections()).thenReturn(8);
        when(pool.getIdleConnections()).thenReturn(2);
        when(pool.getTotalConnections()).thenReturn(10);
        when(pool.getThreadsAwaitingConnection()).thenReturn(3);
        var result = new ResourceUsageEndpoint(Map.of("dataSource", source), memory).read();
        assertThat(result.measurable()).isTrue();
        assertThat(result.heap().usedPercent()).isEqualTo(25.0);
        assertThat(result.pools().get(0).usedPercent()).isEqualTo(80.0);
        assertThat(result.pools().get(0).pendingRequests()).isEqualTo(3);
        assertThat(result.gc().collectors()).isNotEmpty();
        assertThat(result.loginDiagnostics().enabled()).isFalse();
        assertThat(result.loginDiagnostics().recent()).isEmpty();
        verify(source, never()).getConnection();
    }

    @Test void uninitializedPoolAndUnknownHeapAreNotZeroUsage() {
        var memory = mock(MemoryMXBean.class);
        when(memory.getHeapMemoryUsage()).thenReturn(new MemoryUsage(-1, 128, 256, -1));
        var source = mock(HikariDataSource.class);
        when(source.getMaximumPoolSize()).thenReturn(10);
        var result = new ResourceUsageEndpoint(Map.of("dataSource", source), memory).read();
        assertThat(result.measurable()).isFalse();
        assertThat(result.heap().usedPercent()).isNull();
        assertThat(result.pools().get(0).activeConnections()).isNull();
        assertThat(result.pools().get(0).initialized()).isFalse();
    }

    @Test void unsupportedOrMissingDatasourceIsNotReportedAsHealthy() throws Exception {
        var memory = mock(MemoryMXBean.class);
        when(memory.getHeapMemoryUsage()).thenReturn(new MemoryUsage(-1, 128, 256, 512));
        var source = mock(DataSource.class);
        assertThat(new ResourceUsageEndpoint(Map.of("other", source), memory).read().measurable()).isFalse();
        assertThat(new ResourceUsageEndpoint(Map.of(), memory).read().measurable()).isFalse();
        verifyNoInteractions(source);
    }
}
