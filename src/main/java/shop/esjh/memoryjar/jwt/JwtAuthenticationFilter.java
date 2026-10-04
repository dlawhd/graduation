package shop.esjh.memoryjar.jwt;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final SessionValidityService sessionValidityService;

    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider, SessionValidityService sessionValidityService) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.sessionValidityService = sessionValidityService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String jwt = extractAccessTokenFromCookie(request);

        // OAuth 로그인 진행에는 HTTP 세션이 필요하지만 API·소켓 인증은 반드시 현재 JWT로 한다.
        // 오래된 JSESSIONID 인증이 폐기한 JWT 검사를 우회하지 않도록 경계를 분리한다.
        String path = request.getServletPath();
        if (path.startsWith("/api/") || path.equals("/ws") || path.startsWith("/ws/")) {
            SecurityContextHolder.clearContext();
        }

        if (jwt != null && jwtTokenProvider.validate(jwt)) {

            Claims claims = jwtTokenProvider.getClaimsFromToken(jwt);

            // ✅ subject = userId (String)
            String userId = claims.getSubject();
            Number versionClaim = claims.get("sessionVersion", Number.class);
            long sessionVersion = versionClaim == null ? 0L : versionClaim.longValue();
            if (!sessionValidityService.isCurrent(Long.parseLong(userId), sessionVersion)) {
                SecurityContextHolder.clearContext();
                filterChain.doFilter(request, response);
                return;
            }

            String email = (String) claims.get("email");
            String name = (String) claims.get("name");
            String birthyear = (String) claims.get("birthyear");

            Map<String, Object> principal = new HashMap<>();
            principal.put("userId", userId);
            principal.put("email", email);
            principal.put("name", name);
            principal.put("birthyear", birthyear);
            principal.put("sessionVersion", sessionVersion);
            principal.put("tokenExpiresAt", claims.getExpiration().getTime());

            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(principal, null, List.of());

            auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(auth);
        }


        filterChain.doFilter(request, response);
    }

    private String extractAccessTokenFromCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;

        for (Cookie cookie : cookies) {
            if ("accessToken".equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
