package shop.esjh.memoryjar.config;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.autoconfigure.security.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/** 관리 지표는 별도 내부 포트의 loopback GET만 허용하고 일반 API 포트에서는 차단한다. */
@Configuration(proxyBeanMethods = false)
public class ManagementSecurityConfig {
    @Bean
    @Order(1)
    SecurityFilterChain managementSecurityFilterChain(HttpSecurity http,
            @Value("${management.server.port:9091}") int managementPort,
            @Value("${server.port:8080}") int applicationPort,
            @Value("${management.server.address:127.0.0.1}") String address) throws Exception {
        // 외부 bind나 서비스 포트와의 혼용은 실수로도 허용하지 않는다.
        if (managementPort <= 0 || managementPort == applicationPort || !"127.0.0.1".equals(address)) {
            throw new IllegalStateException("Management requires a separate positive port bound to 127.0.0.1");
        }
        var endpoints = EndpointRequest.toAnyEndpoint();
        http.securityMatcher(request -> endpoints.matches(request) || actuatorPath(request))
                .authorizeHttpRequests(auth -> auth.anyRequest().access((authentication, context) ->
                        new AuthorizationDecision(isAllowed(context.getRequest(), managementPort))))
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, failure) -> response.sendError(403))
                        .accessDeniedHandler((request, response, failure) -> response.sendError(403)));
        // 일반 API의 JWT·쿠키·CORS·CSRF 설정은 기존 SecurityConfig에 그대로 둔다.
        // 이 체인도 CSRF 기본 보호를 유지하며 GET 이외에는 허용하지 않는다.
        return http.build();
    }

    private static boolean actuatorPath(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return path.equals("/actuator") || path.startsWith("/actuator/");
    }

    static boolean isAllowed(HttpServletRequest request, int port) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (!"GET".equals(request.getMethod()) || request.getLocalPort() != port
                || !(path.equals("/actuator/health") || path.equals("/actuator/resources"))) return false;
        try {
            // X-Forwarded-* 같은 클라이언트 헤더를 접근 권한 판단에 사용하지 않는다.
            return InetAddress.getByName(request.getLocalAddr()).isLoopbackAddress()
                    && InetAddress.getByName(request.getRemoteAddr()).isLoopbackAddress();
        } catch (java.net.UnknownHostException invalidAddress) { return false; }
    }
}
