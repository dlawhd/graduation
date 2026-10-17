package shop.esjh.memoryjar.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 프록시 헤더나 로그인 여부로 내부 전용 관리 포트 제한을 우회할 수 없도록 검사한다. */
class ManagementSecurityConfigTest {
    @Test void refusesUnsafeManagementConfigurationBeforeBuildingChain() {
        var config = new ManagementSecurityConfig();
        assertThatThrownBy(() -> config.managementSecurityFilterChain(null, 8080, 8080, "127.0.0.1"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> config.managementSecurityFilterChain(null, 9091, 8080, "0.0.0.0"))
                .isInstanceOf(IllegalStateException.class);
    }
    private MockHttpServletRequest request() {
        var request = new MockHttpServletRequest("GET", "/actuator/resources");
        request.setLocalPort(9091);
        request.setLocalAddr("127.0.0.1");
        request.setRemoteAddr("127.0.0.1");
        return request;
    }
    @Test void allowsOnlyLoopbackManagementGet() {
        assertThat(ManagementSecurityConfig.isAllowed(request(), 9091)).isTrue();
    }
    @Test void rejectsMainPortEvenWithForwardedHeaders() {
        var request = request(); request.setLocalPort(8080);
        request.addHeader("X-Forwarded-Port", "9091");
        assertThat(ManagementSecurityConfig.isAllowed(request, 9091)).isFalse();
    }
    @Test void rejectsRemoteAddressAndNonLoopbackBind() {
        var request = request(); request.setRemoteAddr("192.0.2.1");
        assertThat(ManagementSecurityConfig.isAllowed(request, 9091)).isFalse();
        request.setRemoteAddr("127.0.0.1"); request.setLocalAddr("172.18.0.2");
        assertThat(ManagementSecurityConfig.isAllowed(request, 9091)).isFalse();
    }
    @Test void rejectsWritesAndSensitiveEndpoints() {
        var request = request(); request.setMethod("POST");
        assertThat(ManagementSecurityConfig.isAllowed(request, 9091)).isFalse();
        request.setMethod("GET"); request.setRequestURI("/actuator/env");
        assertThat(ManagementSecurityConfig.isAllowed(request, 9091)).isFalse();
    }
}
