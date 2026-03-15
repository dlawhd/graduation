package com.example.demo.controller;

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
        CsrfToken result = controller.csrf(csrfToken);

        // then
        assertThat(result.getHeaderName()).isEqualTo("X-XSRF-TOKEN");
        assertThat(result.getParameterName()).isEqualTo("_csrf");
        assertThat(result.getToken()).isEqualTo("test-csrf-token");
    }
}