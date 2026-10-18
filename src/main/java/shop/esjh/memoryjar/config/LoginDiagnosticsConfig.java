package shop.esjh.memoryjar.config;

import org.springframework.boot.autoconfigure.security.SecurityProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import shop.esjh.memoryjar.monitoring.LoginDiagnostics;
import shop.esjh.memoryjar.monitoring.LoginDiagnosticsFilter;

/** 상세 진단 필터를 보안 필터 바로 앞에 등록한다. 인증·인가 정책이나 API 응답은 변경하지 않는다. */
@Configuration(proxyBeanMethods = false)
public class LoginDiagnosticsConfig {
    @Bean
    FilterRegistrationBean<LoginDiagnosticsFilter> loginDiagnosticsFilter(LoginDiagnostics diagnostics) {
        var registration = new FilterRegistrationBean<>(new LoginDiagnosticsFilter(diagnostics));
        registration.setName("loginDiagnosticsFilter");
        registration.addUrlPatterns("/api/v1/auth/login");
        registration.setOrder(SecurityProperties.DEFAULT_FILTER_ORDER - 1);
        return registration;
    }
}
