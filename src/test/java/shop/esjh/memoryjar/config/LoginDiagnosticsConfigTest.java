package shop.esjh.memoryjar.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.security.SecurityProperties;
import shop.esjh.memoryjar.monitoring.LoginDiagnostics;
import static org.assertj.core.api.Assertions.assertThat;

/** 등록 경로와 필터 순서가 보안 필터 바깥의 승인된 두 경로로 제한되는지 검사한다. */
class LoginDiagnosticsConfigTest {
    @Test void registrationIncludesOnlyApprovedPathsBeforeSecurity() {
        var registration = new LoginDiagnosticsConfig().loginDiagnosticsFilter(new LoginDiagnostics(true));
        assertThat(registration.getUrlPatterns()).containsExactly("/api/v1/auth/login", "/api/v1/csrf");
        assertThat(registration.getOrder()).isEqualTo(SecurityProperties.DEFAULT_FILTER_ORDER - 1);
    }
}
