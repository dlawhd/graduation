package shop.esjh.memoryjar.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.*;

/** 조회 허용 경로·기본 꺼짐·보관 상한·개인정보·요청별 DB 집계 분리를 외부 통신 없이 확인한다. */
class ReadDiagnosticsTest {
    @Test void readFlagIsSeparateFromExistingLoginFlagAndDisabledDoesNotReadGc() throws Exception {
        var off = new LoginDiagnostics(true, false, () -> { throw new AssertionError("GC must not be read"); });
        new LoginDiagnosticsFilter(off).doFilter(new MockHttpServletRequest("GET", "/api/v1/me"),
                new MockHttpServletResponse(), (r, s) -> assertThat(LoginDiagnostics.beginDatabaseOperation()).isNull());
        assertThat(off.snapshot().reads().enabled()).isFalse();
        assertThat(off.snapshot().reads().recent()).isEmpty();
        assertThat(off.snapshot().recent()).isEmpty();
        var readsOnly = new LoginDiagnostics(false, true);
        assertThat(readsOnly.start()).isNull();
        var attempt = readsOnly.start(LoginDiagnostics.RequestKind.ME);
        assertThat(attempt).isNotNull();
        readsOnly.finish(attempt, 200, true);
        assertThat(readsOnly.snapshot().reads().recent()).hasSize(1);
    }

    @Test void exactGetRoutesAreClassifiedButIdsQueriesAndPrivateDataAreNotRetained() throws Exception {
        var diagnostics = new LoginDiagnostics(false, true);
        var filter = new LoginDiagnosticsFilter(diagnostics);
        var routes = Map.of("/api/v1/me", LoginDiagnostics.RequestKind.ME,
                "/api/v1/jars", LoginDiagnostics.RequestKind.JAR_LIST,
                "/api/v1/jars/42", LoginDiagnostics.RequestKind.JAR_DETAIL,
                "/api/v1/jars/42/notes", LoginDiagnostics.RequestKind.NOTE_LIST);
        for (var entry : routes.entrySet()) {
            var request = new MockHttpServletRequest("GET", "/context" + entry.getKey());
            request.setContextPath("/context");
            request.setQueryString("q=private-search");
            request.addHeader("Authorization", "private-token");
            filter.doFilter(request, new MockHttpServletResponse(), (r, s) -> { });
        }
        assertThat(diagnostics.snapshot().reads().recent()).extracting(LoginDiagnostics.Sample::requestKind)
                .containsExactlyInAnyOrderElementsOf(routes.values());
        var json = new ObjectMapper().writeValueAsString(diagnostics.snapshot());
        assertThat(json).doesNotContain("private-search", "private-token", "/api/v1/", "\"userId\"", "\"jarId\"");
        for (var route : List.of("/api/v1/me/extra", "/api/v1/jars/42/members", "/api/v1/jars/42/notes/9",
                "/api/v1/jars/not-a-number", "/api/v1/jars/42/", "/actuator/resources")) {
            filter.doFilter(new MockHttpServletRequest("GET", route), new MockHttpServletResponse(), (r, s) -> { });
        }
        filter.doFilter(new MockHttpServletRequest("POST", "/api/v1/jars"), new MockHttpServletResponse(), (r, s) -> { });
        filter.doFilter(new MockHttpServletRequest("PATCH", "/api/v1/me"), new MockHttpServletResponse(), (r, s) -> { });
        assertThat(diagnostics.snapshot().reads().completedCount()).isEqualTo(4);
    }

    @Test void databaseCountsAreAggregatedAndOldMeasurementCannotLeakIntoNextRequest() {
        var diagnostics = new LoginDiagnostics(false, true);
        var attempt = diagnostics.start(LoginDiagnostics.RequestKind.ME);
        var listener = new ReadDatabaseDiagnosticsListener();
        for (int i = 0; i < 3; i++) { listener.jdbcExecuteStatementStart(); listener.jdbcExecuteStatementEnd(); }
        listener.jdbcConnectionAcquisitionStart(); listener.jdbcConnectionAcquisitionEnd();
        listener.jdbcPrepareStatementStart(); listener.jdbcPrepareStatementEnd();
        listener.jdbcExecuteBatchStart(); listener.jdbcExecuteBatchEnd();
        var stale = LoginDiagnostics.beginDatabaseOperation();
        diagnostics.finish(attempt, 200, true);
        var timings = diagnostics.snapshot().reads().recent().get(0).database();
        assertThat(timings.get(LoginDiagnostics.DatabaseOperation.STATEMENT_EXECUTE).count()).isEqualTo(3);
        assertThat(timings.values()).allSatisfy(t -> assertThat(t.totalNanos()).isGreaterThanOrEqualTo(t.maxNanos()));
        attempt = diagnostics.start(LoginDiagnostics.RequestKind.JAR_LIST);
        LoginDiagnostics.endDatabaseOperation(LoginDiagnostics.DatabaseOperation.STATEMENT_EXECUTE, stale);
        diagnostics.finish(attempt, 200, true);
        assertThat(diagnostics.snapshot().reads().recent().get(1).database()).isEmpty();
        assertThat(LoginDiagnostics.beginDatabaseOperation()).isNull();
    }

    @Test void slowAndFailedReadRetentionIsBoundedAndIndependentOfFastReadsAndLogins() throws Exception {
        var diagnostics = new LoginDiagnostics(true, true);
        diagnostics.finish(diagnostics.start(), 200, true);
        // 실제로 기다리지 않고 시작 시각만 과거로 옮겨 500ms 초과 보관을 결정적으로 검사한다.
        var slow = diagnostics.start(LoginDiagnostics.RequestKind.ME);
        org.springframework.test.util.ReflectionTestUtils.setField(slow, "startedNanos", System.nanoTime() - 600_000_000L);
        diagnostics.finish(slow, 200, true);
        for (int i = 0; i < 70; i++) diagnostics.finish(diagnostics.start(LoginDiagnostics.RequestKind.JAR_LIST), 200, true);
        var snapshot = diagnostics.snapshot();
        assertThat(snapshot.recent()).hasSize(1);
        assertThat(snapshot.reads().recent()).hasSize(64);
        assertThat(snapshot.reads().slow()).hasSize(1);
        assertThat(snapshot.reads().slow().get(0).requestKind()).isEqualTo(LoginDiagnostics.RequestKind.ME);
        assertThat(snapshot.reads().recentEvictedCount()).isEqualTo(7);
        for (int i = 0; i < 40; i++) diagnostics.finish(diagnostics.start(LoginDiagnostics.RequestKind.NOTE_LIST), null, false);
        snapshot = diagnostics.snapshot();
        assertThat(snapshot.reads().slow()).hasSize(32);
        assertThat(snapshot.reads().slowEvictedCount()).isEqualTo(9);
        assertThat(snapshot.reads().completedCount()).isEqualTo(111);
        assertThatThrownBy(() -> diagnostics.snapshot().reads().slow().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test void exceptionsRemainUnchangedAndThreadLocalIsRemovedAfterFailedRead() throws Exception {
        var diagnostics = new LoginDiagnostics(false, true);
        var original = new IllegalArgumentException("private-database-error");
        assertThatThrownBy(() -> new LoginDiagnosticsFilter(diagnostics).doFilter(
                new MockHttpServletRequest("GET", "/api/v1/me"), new MockHttpServletResponse(),
                (r, s) -> LoginDiagnostics.measure(LoginDiagnostics.Stage.ME_SERVICE, () -> { throw original; })))
                .isSameAs(original);
        var sample = diagnostics.snapshot().reads().slow().get(0);
        assertThat(sample.responseStatus()).isNull();
        assertThat(sample.completed()).isFalse();
        assertThat(sample.stages().get(LoginDiagnostics.Stage.ME_SERVICE).completed()).isFalse();
        assertThat(LoginDiagnostics.beginDatabaseOperation()).isNull();
        assertThat(new ObjectMapper().writeValueAsString(sample)).doesNotContain("private-database-error");
    }

    @Test void concurrentReadRequestsHaveSeparateDatabaseCounters() throws Exception {
        var diagnostics = new LoginDiagnostics(false, true);
        var workers = Executors.newFixedThreadPool(2);
        try {
            var tasks = workers.invokeAll(List.of(() -> record(diagnostics, 2), () -> record(diagnostics, 5)));
            for (var task : tasks) task.get();
            assertThat(diagnostics.snapshot().reads().recent()).extracting(s -> s.database()
                    .get(LoginDiagnostics.DatabaseOperation.STATEMENT_EXECUTE).count()).containsExactlyInAnyOrder(2L, 5L);
        } finally { workers.shutdownNow(); }
    }

    @Test void databaseTimingsBelongToTheInnermostStageWithoutDoubleCountingParents() {
        var diagnostics = new LoginDiagnostics(false, true);
        var attempt = diagnostics.start(LoginDiagnostics.RequestKind.ME);
        var listener = new ReadDatabaseDiagnosticsListener();
        LoginDiagnostics.measure(LoginDiagnostics.Stage.ME_SERVICE, () -> {
            LoginDiagnostics.measure(LoginDiagnostics.Stage.SESSION_VERSION_QUERY, () -> {
                listener.jdbcExecuteStatementStart(); listener.jdbcExecuteStatementEnd(); return true;
            });
            listener.jdbcExecuteStatementStart(); listener.jdbcExecuteStatementEnd();
            return true;
        });
        diagnostics.finish(attempt, 200, true);
        var sample = diagnostics.snapshot().reads().recent().get(0);
        assertThat(sample.database().get(LoginDiagnostics.DatabaseOperation.STATEMENT_EXECUTE).count()).isEqualTo(2);
        for (var stage : List.of(LoginDiagnostics.Stage.ME_SERVICE, LoginDiagnostics.Stage.SESSION_VERSION_QUERY)) {
            assertThat(sample.databaseByStage().get(stage).get(LoginDiagnostics.DatabaseOperation.STATEMENT_EXECUTE).count()).isEqualTo(1);
        }
    }

    private Void record(LoginDiagnostics diagnostics, int count) {
        var attempt = diagnostics.start(LoginDiagnostics.RequestKind.JAR_DETAIL);
        try {
            var listener = new ReadDatabaseDiagnosticsListener();
            for (int i = 0; i < count; i++) { listener.jdbcExecuteStatementStart(); listener.jdbcExecuteStatementEnd(); }
        } finally { diagnostics.finish(attempt, 200, true); }
        return null;
    }
}
