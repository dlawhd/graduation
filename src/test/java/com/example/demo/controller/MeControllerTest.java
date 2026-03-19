package com.example.demo.controller;

import com.example.demo.dto.response.MeResponse;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import com.example.demo.dto.response.ApiResponse;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

// Authentication 값에 따라 /api/me 응답 내용을 잘 만드는지 확인
class MeControllerTest {

    private final MeController meController = new MeController();

    @Test
    void principal이_Map이면_회원정보를_반환한다() {
        // given
        Map<String, Object> principal = Map.of(
                "userId", 1L,
                "email", "user@example.com",
                "name", "은서",
                "birthyear", "2000"
        );

        TestingAuthenticationToken authentication =
                new TestingAuthenticationToken(principal, null);

        // when
        ApiResponse<MeResponse> result = meController.me(authentication);

        // then
        assertThat(result.data().userId()).isEqualTo(1L);
        assertThat(result.data().email()).isEqualTo("user@example.com");
        assertThat(result.data().name()).isEqualTo("은서");
        assertThat(result.data().birthyear()).isEqualTo("2000");
    }

    @Test
    void principal이_Map이_아니면_authentication_name을_userId로_반환한다() {
        // given
        TestingAuthenticationToken authentication =
                new TestingAuthenticationToken("principal-string", null);

        authentication.setAuthenticated(true);

        // when
        ApiResponse<MeResponse> result = meController.me(authentication);

        // then
        assertThat(result.data().userId()).isEqualTo("principal-string");
        assertThat(result.data().email()).isNull();
        assertThat(result.data().name()).isNull();
        assertThat(result.data().birthyear()).isNull();
    }
}