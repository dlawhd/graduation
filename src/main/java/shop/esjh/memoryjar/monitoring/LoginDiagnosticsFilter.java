package shop.esjh.memoryjar.monitoring;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/** 로그인 POST와 CSRF GET의 보안 필터·컨트롤러·직렬화를 둘러싸며 본문·헤더는 읽지 않는다. */
public class LoginDiagnosticsFilter extends OncePerRequestFilter {
    private final LoginDiagnostics diagnostics;
    public LoginDiagnosticsFilter(LoginDiagnostics diagnostics) { this.diagnostics = diagnostics; }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return requestKind(request) == null;
    }

    private LoginDiagnostics.RequestKind requestKind(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if ("POST".equals(request.getMethod()) && uri.equals(request.getContextPath() + "/api/v1/auth/login")) {
            return LoginDiagnostics.RequestKind.LOGIN;
        }
        if ("GET".equals(request.getMethod()) && uri.equals(request.getContextPath() + "/api/v1/csrf")) {
            return LoginDiagnostics.RequestKind.CSRF;
        }
        return null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var attempt = diagnostics.start(requestKind(request));
        boolean completed = false;
        try {
            chain.doFilter(request, response);
            completed = true;
        } finally {
            // 미처리 예외가 컨테이너에서 나중에 500으로 바뀔 수 있으므로 응답 상태를 추측하지 않는다.
            diagnostics.finish(attempt, completed ? response.getStatus() : null, completed);
        }
    }
}
