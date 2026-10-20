package shop.esjh.memoryjar.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.hibernate.cfg.AvailableSettings;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

/** 외부 DB 없이 실제 Hikari·Hibernate·메모리 H2에서 콜백 연결과 풀 대기를 검증한다. */
class ReadDatabaseDiagnosticsIntegrationTest {
    @Test void realHibernateCallbacksSeparatePoolAcquisitionFromStatementExecutionAndPreserveFailure() throws Exception {
        try (var source = new HikariDataSource()) {
            source.setJdbcUrl("jdbc:h2:mem:read_diagnostics;DB_CLOSE_DELAY=-1");
            source.setMaximumPoolSize(1);
            source.setMinimumIdle(1);
            source.setConnectionTimeout(5000);
            // 시험용 @Entity도 서비스의 자동 탐색에 섞일 수 있어 엔티티·테이블 없이 검사한다.
            var config = new Configuration();
            config.getProperties().put(AvailableSettings.DATASOURCE, source);
            config.setProperty(AvailableSettings.HBM2DDL_AUTO, "create-drop");
            config.setProperty(AvailableSettings.AUTO_SESSION_EVENTS_LISTENER, ReadDatabaseDiagnosticsListener.class.getName());
            var diagnostics = new LoginDiagnostics(false, true);
            try (var factory = config.buildSessionFactory(); var held = source.getConnection()) {
                var executor = Executors.newSingleThreadExecutor();
                try {
                    var result = executor.submit(() -> {
                        var attempt = diagnostics.start(LoginDiagnostics.RequestKind.ME);
                        try (var session = factory.openSession()) {
                            var transaction = session.beginTransaction();
                            assertThat(session.createNativeQuery("select 1", Integer.class).getSingleResult()).isEqualTo(1);
                            transaction.commit();
                        } finally { diagnostics.finish(attempt, 200, true); }
                        return diagnostics.snapshot().reads().recent().get(0);
                    });
                    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
                    while (source.getHikariPoolMXBean().getThreadsAwaitingConnection() == 0 && System.nanoTime() < deadline) {
                        Thread.sleep(5);
                    }
                    assertThat(source.getHikariPoolMXBean().getThreadsAwaitingConnection()).isEqualTo(1);
                    // 다른 요청이 반환한 연결을 원래 풀에서 빌리게 한다. 풀·DataSource를 교체하지 않는다.
                    held.close();
                    var sample = result.get(5, TimeUnit.SECONDS);
                    assertThat(sample.database().get(LoginDiagnostics.DatabaseOperation.CONNECTION_ACQUIRE).count()).isEqualTo(1);
                    assertThat(sample.database().get(LoginDiagnostics.DatabaseOperation.CONNECTION_ACQUIRE).totalNanos()).isPositive();
                    assertThat(sample.database().get(LoginDiagnostics.DatabaseOperation.STATEMENT_EXECUTE).count()).isEqualTo(1);
                    assertThat(sample.database().get(LoginDiagnostics.DatabaseOperation.STATEMENT_PREPARE).count()).isEqualTo(1);
                    assertThat(source.getHikariPoolMXBean().getActiveConnections()).isZero();
                } finally { held.close(); executor.shutdownNow(); }

                var failed = diagnostics.start(LoginDiagnostics.RequestKind.JAR_LIST);
                try (var session = factory.openSession()) {
                    assertThatThrownBy(() -> session.createNativeQuery("select absent_column", Object.class)
                            .getResultList()).isInstanceOf(org.hibernate.exception.SQLGrammarException.class);
                } finally { diagnostics.finish(failed, null, false); }
                var sample = diagnostics.snapshot().reads().slow().stream().filter(s -> !s.completed()).findFirst().orElseThrow();
                assertThat(sample.completed()).isFalse();
                assertThat(sample.database()).containsKey(LoginDiagnostics.DatabaseOperation.STATEMENT_PREPARE);
                assertThat(new ObjectMapper().writeValueAsString(diagnostics.snapshot()))
                        .doesNotContain("absent_column", "select ", "jdbc:h2", "read_diagnostics_probe");
                assertThat(LoginDiagnostics.beginDatabaseOperation()).isNull();
                assertThat(source.getHikariPoolMXBean().getActiveConnections()).isZero();
            }
        }
    }
}
