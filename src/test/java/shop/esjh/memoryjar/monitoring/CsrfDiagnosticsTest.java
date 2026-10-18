package shop.esjh.memoryjar.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.Cookie;
import java.util.Date;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.DefaultCsrfToken;
import shop.esjh.memoryjar.controller.CsrfController;
import shop.esjh.memoryjar.jwt.JwtAuthenticationFilter;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.jwt.SessionValidityService;
import shop.esjh.memoryjar.repository.UserRepository;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 실제 인증 필터·세션 서비스·CSRF 컨트롤러의 계측 연결과 보안 동작 보존을 외부 통신 없이 검사한다. */
class CsrfDiagnosticsTest {
    private final LoginDiagnostics diagnostics = new LoginDiagnostics(true);
    private final JwtTokenProvider tokens = mock(JwtTokenProvider.class);
    private final UserRepository users = mock(UserRepository.class);
    private final JwtAuthenticationFilter jwt = new JwtAuthenticationFilter(tokens, new SessionValidityService(users));
    private final LoginDiagnosticsFilter filter = new LoginDiagnosticsFilter(diagnostics);
    private final CsrfController controller = new CsrfController();

    @AfterEach void clearSecurityContext() { SecurityContextHolder.clearContext(); }

    @Test void disabledCsrfDoesNotCollectOrReadGc() throws Exception {
        var disabled = new LoginDiagnostics(false, () -> { throw new AssertionError("must not sample GC"); });
        new LoginDiagnosticsFilter(disabled).doFilter(new MockHttpServletRequest("GET", "/api/v1/csrf"),
                new MockHttpServletResponse(), (r, s) -> controller.csrf(new DefaultCsrfToken("X-XSRF-TOKEN", "_csrf", "private-csrf-token")));
        assertThat(disabled.snapshot().recent()).isEmpty();
    }

    @Test void authenticatedCsrfSeparatesStagesWithoutRecordingTokensOrUserData() throws Exception {
        validToken();
        when(users.findSessionVersionById(1L)).thenReturn(Optional.of(0L));
        execute(true);
        var sample = diagnostics.snapshot().recent().get(0);
        assertThat(sample.requestKind()).isEqualTo(LoginDiagnostics.RequestKind.CSRF);
        assertThat(sample.responseStatus()).isEqualTo(200);
        assertThat(sample.stages()).containsOnlyKeys(LoginDiagnostics.Stage.JWT_VALIDATE,
                LoginDiagnostics.Stage.JWT_CLAIMS_PARSE, LoginDiagnostics.Stage.SESSION_VERSION_QUERY,
                LoginDiagnostics.Stage.CSRF_CONTROLLER);
        assertThat(sample.stages().values()).allSatisfy(t -> {
            assertThat(t.completed()).isTrue();
            assertThat(t.elapsedNanos()).isPositive();
        });
        verify(tokens, times(1)).validate("private-access-token");
        verify(tokens, times(1)).getClaimsFromToken("private-access-token");
        verify(users, times(1)).findSessionVersionById(1L);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        String json = new ObjectMapper().writeValueAsString(diagnostics.snapshot());
        assertThat(json).doesNotContain("private-access-token", "private-csrf-token", "private@example.invalid");
    }

    @Test void anonymousCsrfDoesNotIntroduceJwtOrDatabaseCalls() throws Exception {
        execute(false);
        assertThat(diagnostics.snapshot().recent().get(0).stages())
                .containsOnlyKeys(LoginDiagnostics.Stage.CSRF_CONTROLLER);
        verifyNoInteractions(tokens, users);
    }

    @Test void invalidAndRevokedTokensDoNotBecomeAuthenticatedForPublicCsrf() throws Exception {
        when(tokens.validate("private-access-token")).thenReturn(false);
        execute(true);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verifyNoInteractions(users);
        validToken();
        when(users.findSessionVersionById(1L)).thenReturn(Optional.of(1L));
        execute(true);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(diagnostics.snapshot().recent()).hasSize(2).allSatisfy(s -> {
            assertThat(s.responseStatus()).isEqualTo(200);
            assertThat(s.stages()).containsKey(LoginDiagnostics.Stage.CSRF_CONTROLLER);
        });
    }

    @Test void repositoryFailureIsPreservedAndCannotContaminateNextRequest() throws Exception {
        validToken();
        var failure = new IllegalStateException("private-database-error");
        when(users.findSessionVersionById(1L)).thenThrow(failure);
        assertThatThrownBy(() -> execute(true)).isSameAs(failure);
        var failed = diagnostics.snapshot().recent().get(0);
        assertThat(failed.responseStatus()).isNull();
        assertThat(failed.completed()).isFalse();
        assertThat(failed.stages().get(LoginDiagnostics.Stage.SESSION_VERSION_QUERY).completed()).isFalse();
        execute(false);
        assertThat(diagnostics.snapshot().recent().get(1).stages()).containsOnlyKeys(LoginDiagnostics.Stage.CSRF_CONTROLLER);
        assertThat(new ObjectMapper().writeValueAsString(diagnostics.snapshot())).doesNotContain("private-database-error");
    }

    @Test void onlyExactGetCsrfAndPostLoginRoutesAreRecordedIncludingContextPath() throws Exception {
        for (var request : java.util.List.of(new MockHttpServletRequest("POST", "/api/v1/csrf"),
                new MockHttpServletRequest("GET", "/api/v1/csrf/extra"),
                new MockHttpServletRequest("OPTIONS", "/api/v1/csrf"))) {
            filter.doFilter(request, new MockHttpServletResponse(), (r, s) -> { });
        }
        assertThat(diagnostics.snapshot().recent()).isEmpty();
        var request = new MockHttpServletRequest("GET", "/context/api/v1/csrf");
        request.setContextPath("/context");
        request.setQueryString("private-query-must-not-be-retained");
        filter.doFilter(request, new MockHttpServletResponse(), (r, s) -> { });
        assertThat(diagnostics.snapshot().recent().get(0).requestKind()).isEqualTo(LoginDiagnostics.RequestKind.CSRF);
        assertThat(new ObjectMapper().writeValueAsString(diagnostics.snapshot())).doesNotContain("private-query");
    }

    private void validToken() {
        var claims = mock(Claims.class);
        when(tokens.validate("private-access-token")).thenReturn(true);
        when(tokens.getClaimsFromToken("private-access-token")).thenReturn(claims);
        when(claims.getSubject()).thenReturn("1");
        when(claims.getExpiration()).thenReturn(new Date(System.currentTimeMillis() + 60_000));
        when(claims.get("email")).thenReturn("private@example.invalid");
    }

    /** 실제 서비스와 같은 필터 순서로 실행하되 Repository와 토큰 제공자는 메모리 대역만 사용한다. */
    private void execute(boolean withToken) throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/v1/csrf");
        request.setServletPath("/api/v1/csrf");
        if (withToken) request.setCookies(new Cookie("accessToken", "private-access-token"));
        filter.doFilter(request, new MockHttpServletResponse(), (r, s) -> jwt.doFilter(r, s,
                (innerRequest, innerResponse) -> controller.csrf(new DefaultCsrfToken(
                        "X-XSRF-TOKEN", "_csrf", "private-csrf-token"))));
    }
}
