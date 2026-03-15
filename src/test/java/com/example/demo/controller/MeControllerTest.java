package com.example.demo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

// Authentication 값에 따라 /api/me 응답 내용을 잘 만드는지 확인
class MeControllerTest {

    private final MeController meController = new MeController();

    @Test
    void authentication이_null이면_authenticated_false를_반환한다() {
        // when
        Map<String, Object> result = meController.me(null);

        // then
        assertThat(result.get("authenticated")).isEqualTo(false);
        assertThat(result).hasSize(1);
    }

    @Test
    void principal이_Map이면_회원정보를_반환한다() {
        // given
        Map<String, Object> principal = Map.of(
                "memberId", 1L,
                "email", "user@example.com",
                "name", "은서",
                "birthyear", "2000"
        );

        TestingAuthenticationToken authentication =
                new TestingAuthenticationToken(principal, null);

        // when
        Map<String, Object> result = meController.me(authentication);

        // then
        assertThat(result.get("authenticated")).isEqualTo(true);
        assertThat(result.get("memberId")).isEqualTo(1L);
        assertThat(result.get("email")).isEqualTo("user@example.com");
        assertThat(result.get("name")).isEqualTo("은서");
        assertThat(result.get("birthyear")).isEqualTo("2000");
    }

    @Test
    void principal이_Map이_아니면_authentication_name을_memberId로_반환한다() {
        // given
        TestingAuthenticationToken authentication =
                new TestingAuthenticationToken("principal-string", null);

        authentication.setAuthenticated(true);

        // when
        Map<String, Object> result = meController.me(authentication);

        // then
        assertThat(result.get("authenticated")).isEqualTo(true);
        assertThat(result.get("memberId")).isEqualTo("principal-string");
        assertThat(result).doesNotContainKeys("email", "name", "birthyear");
    }
}