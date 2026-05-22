package shop.esjh.memoryjar.controller;

import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.dto.response.CsrfResponse;
import org.junit.jupiter.api.Test;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.DefaultCsrfToken;

import static org.assertj.core.api.Assertions.assertThat;

// 받은 CsrfToken을 그대로 반환하는지 확인
class CsrfControllerTest {

    @Test
    void csrf_토큰을_그대로_반환한다() {
        // given
        CsrfController controller = new CsrfController();
        CsrfToken csrfToken = new DefaultCsrfToken(
                "X-XSRF-TOKEN",
                "_csrf",
                "test-csrf-token"
        );

        // when
        ApiResponse<CsrfResponse> result = controller.csrf(csrfToken);

        // then
        assertThat(result.data().headerName()).isEqualTo("X-XSRF-TOKEN");
        assertThat(result.data().parameterName()).isEqualTo("_csrf");
        assertThat(result.data().token()).isEqualTo("test-csrf-token");
    }
}