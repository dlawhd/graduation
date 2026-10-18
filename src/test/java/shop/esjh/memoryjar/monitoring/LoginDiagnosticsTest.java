package shop.esjh.memoryjar.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletException;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.*;

/** 원래 인증 동작·예외·개인정보를 건드리지 않고 요청 범위와 고정 크기 진단만 유지하는지 검사한다. */
class LoginDiagnosticsTest {
    @Test void disabledByDefaultDoesNotReadGcOrRetainRequests() {
        var diagnostics = new LoginDiagnostics(false, () -> { throw new AssertionError("must not sample"); });
        assertThat(diagnostics.start()).isNull();
        assertThat(LoginDiagnostics.measure(LoginDiagnostics.Stage.JWT_CREATE, () -> "original")).isEqualTo("original");
        assertThat(diagnostics.snapshot().enabled()).isFalse();
        assertThat(diagnostics.snapshot().recent()).isEmpty();
    }

    @Test void recordsNestedStagesAndGlobalGcDeltasWithoutAddingDurations() {
        var calls = new AtomicInteger();
        var diagnostics = new LoginDiagnostics(true, () -> {
            long n = calls.incrementAndGet();
            return new JvmGcMetrics.Snapshot(List.of(), n, n * 7);
        });
        var attempt = diagnostics.start();
        assertThat(LoginDiagnostics.measure(LoginDiagnostics.Stage.AUTH_SERVICE,
                () -> LoginDiagnostics.measure(LoginDiagnostics.Stage.PASSWORD_VERIFY, () -> true))).isTrue();
        diagnostics.finish(attempt, 200, true);
        var sample = diagnostics.snapshot().recent().get(0);
        assertThat(sample.responseStatus()).isEqualTo(200);
        assertThat(sample.jvmGcCountDelta()).isEqualTo(1);
        assertThat(sample.jvmGcTimeMillisDelta()).isEqualTo(7);
        assertThat(sample.stages()).containsOnlyKeys(LoginDiagnostics.Stage.AUTH_SERVICE, LoginDiagnostics.Stage.PASSWORD_VERIFY);
        assertThat(sample.stages().get(LoginDiagnostics.Stage.AUTH_SERVICE).elapsedNanos())
                .isGreaterThanOrEqualTo(sample.stages().get(LoginDiagnostics.Stage.PASSWORD_VERIFY).elapsedNanos());
    }

    @Test void originalExceptionIsPreservedAndThreadLocalIsCleared() {
        var diagnostics = new LoginDiagnostics(true);
        var attempt = diagnostics.start();
        var original = new IllegalArgumentException("private-input-must-not-be-stored");
        try {
            assertThatThrownBy(() -> LoginDiagnostics.measure(LoginDiagnostics.Stage.CREDENTIAL_LOOKUP,
                    () -> { throw original; })).isSameAs(original);
        } finally { diagnostics.finish(attempt, 401, true); }
        var sample = diagnostics.snapshot().recent().get(0);
        assertThat(sample.stages().get(LoginDiagnostics.Stage.CREDENTIAL_LOOKUP).completed()).isFalse();
        LoginDiagnostics.measure(LoginDiagnostics.Stage.JWT_CREATE, () -> "not-request-scoped");
        assertThat(diagnostics.snapshot().recent().get(0).stages()).doesNotContainKey(LoginDiagnostics.Stage.JWT_CREATE);
    }

    @Test void ringBufferRemainsBoundedAndSnapshotCannotBeMutated() {
        var diagnostics = new LoginDiagnostics(true);
        for (int i = 0; i < 70; i++) diagnostics.finish(diagnostics.start(), 401, true);
        var snapshot = diagnostics.snapshot();
        assertThat(snapshot.recent()).hasSize(64);
        assertThat(snapshot.recent().get(0).diagnosticId()).isEqualTo(7);
        assertThatThrownBy(() -> snapshot.recent().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test void filterDoesNotReadOrSerializePrivateRequestOrExceptionData() throws Exception {
        var diagnostics = new LoginDiagnostics(true);
        var filter = new LoginDiagnosticsFilter(diagnostics);
        var request = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        request.setContent("private-password-input".getBytes());
        request.addHeader("Authorization", "private-token-header");
        var original = new ServletException("private-exception-body");
        assertThatThrownBy(() -> filter.doFilter(request, new MockHttpServletResponse(), (r, s) -> { throw original; }))
                .isSameAs(original);
        var sample = diagnostics.snapshot().recent().get(0);
        assertThat(sample.completed()).isFalse();
        assertThat(sample.responseStatus()).isNull();
        String json = new ObjectMapper().writeValueAsString(diagnostics.snapshot());
        assertThat(json).doesNotContain("private-password-input", "private-token-header", "private-exception-body");
    }

    @Test void otherMethodsAndRoutesAreNeverRecorded() throws Exception {
        var diagnostics = new LoginDiagnostics(true);
        var filter = new LoginDiagnosticsFilter(diagnostics);
        for (var request : List.of(new MockHttpServletRequest("GET", "/api/v1/auth/login"),
                new MockHttpServletRequest("POST", "/api/v1/auth/signup"))) {
            filter.doFilter(request, new MockHttpServletResponse(), (r, s) -> { });
        }
        assertThat(diagnostics.snapshot().recent()).isEmpty();
    }

    @Test void concurrentRequestsDoNotShareStageContext() throws Exception {
        var diagnostics = new LoginDiagnostics(true);
        var pool = Executors.newFixedThreadPool(2);
        try {
            var a = pool.submit(() -> record(diagnostics, LoginDiagnostics.Stage.JWT_CREATE));
            var b = pool.submit(() -> record(diagnostics, LoginDiagnostics.Stage.PASSWORD_VERIFY));
            a.get(); b.get();
            assertThat(diagnostics.snapshot().recent()).hasSize(2).allSatisfy(s -> assertThat(s.stages()).hasSize(1));
        } finally { pool.shutdownNow(); }
    }

    private void record(LoginDiagnostics diagnostics, LoginDiagnostics.Stage stage) {
        var attempt = diagnostics.start();
        try { LoginDiagnostics.measure(stage, () -> true); } finally { diagnostics.finish(attempt, 200, true); }
    }

    @Test void unavailableGcDoesNotChangeAuthenticationAndIsNotZero() {
        var diagnostics = new LoginDiagnostics(true, () -> { throw new IllegalStateException("unavailable"); });
        var attempt = diagnostics.start();
        assertThat(LoginDiagnostics.measure(LoginDiagnostics.Stage.AUTH_SERVICE, () -> 42)).isEqualTo(42);
        diagnostics.finish(attempt, 200, true);
        assertThat(diagnostics.snapshot().recent().get(0).jvmGcCountDelta()).isNull();
    }
}
