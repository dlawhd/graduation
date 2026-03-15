package com.example.demo.service;

import com.example.demo.config.JwtProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

// 쿠키를 잘 저장하는지, 쿠키를 잘 삭제하는지
class AuthCookieServiceTest {

    private AuthCookieService authCookieService;
    private JwtProperties jwtProperties;

    @BeforeEach
    void setUp() {
        // ✅ 테스트용 JWT 설정값 준비
        jwtProperties = new JwtProperties();
        jwtProperties.setAccessExpSeconds(1800);      // 30분
        jwtProperties.setRefreshExpSeconds(1209600); // 14일

        // ✅ 테스트할 서비스 생성
        authCookieService = new AuthCookieService(jwtProperties);
    }

    @Test
    void setAccessCookie_액세스쿠키를_정상적으로_저장한다() {
        // given
        MockHttpServletResponse response = new MockHttpServletResponse();
        String accessJwt = "access-token-value";

        // when
        authCookieService.setAccessCookie(response, accessJwt);

        // then
        String setCookieHeader = response.getHeader(HttpHeaders.SET_COOKIE);

        assertThat(setCookieHeader).isNotNull();
        assertThat(setCookieHeader).contains("accessToken=access-token-value");
        assertThat(setCookieHeader).contains("Path=/");
        assertThat(setCookieHeader).contains("Max-Age=1800");
        assertThat(setCookieHeader).contains("HttpOnly");
        assertThat(setCookieHeader).contains("Secure");
        assertThat(setCookieHeader).contains("SameSite=None");
    }

    @Test
    void setRefreshCookie_리프레시쿠키를_정상적으로_저장한다() {
        // given
        MockHttpServletResponse response = new MockHttpServletResponse();
        String refreshRaw = "refresh-token-value";

        // when
        authCookieService.setRefreshCookie(response, refreshRaw);

        // then
        String setCookieHeader = response.getHeader(HttpHeaders.SET_COOKIE);

        assertThat(setCookieHeader).isNotNull();
        assertThat(setCookieHeader).contains("refreshToken=refresh-token-value");
        assertThat(setCookieHeader).contains("Path=/api");
        assertThat(setCookieHeader).contains("Max-Age=1209600");
        assertThat(setCookieHeader).contains("HttpOnly");
        assertThat(setCookieHeader).contains("Secure");
        assertThat(setCookieHeader).contains("SameSite=None");
    }

    @Test
    void clearAccessCookie_액세스쿠키를_즉시_삭제한다() {
        // given
        MockHttpServletResponse response = new MockHttpServletResponse();

        // when
        authCookieService.clearAccessCookie(response);

        // then
        String setCookieHeader = response.getHeader(HttpHeaders.SET_COOKIE);

        assertThat(setCookieHeader).isNotNull();
        assertThat(setCookieHeader).contains("accessToken=");
        assertThat(setCookieHeader).contains("Path=/");
        assertThat(setCookieHeader).contains("Max-Age=0");
        assertThat(setCookieHeader).contains("HttpOnly");
        assertThat(setCookieHeader).contains("Secure");
        assertThat(setCookieHeader).contains("SameSite=None");
    }

    @Test
    void clearRefreshCookie_리프레시쿠키를_즉시_삭제한다() {
        // given
        MockHttpServletResponse response = new MockHttpServletResponse();

        // when
        authCookieService.clearRefreshCookie(response);

        // then
        String setCookieHeader = response.getHeader(HttpHeaders.SET_COOKIE);

        assertThat(setCookieHeader).isNotNull();
        assertThat(setCookieHeader).contains("refreshToken=");
        assertThat(setCookieHeader).contains("Path=/api");
        assertThat(setCookieHeader).contains("Max-Age=0");
        assertThat(setCookieHeader).contains("HttpOnly");
        assertThat(setCookieHeader).contains("Secure");
        assertThat(setCookieHeader).contains("SameSite=None");
    }

    @Test
    void access와_refresh쿠키를_같은_응답에_둘다_추가할_수_있다() {
        MockHttpServletResponse response = new MockHttpServletResponse();

        authCookieService.setAccessCookie(response, "access-value");
        authCookieService.setRefreshCookie(response, "refresh-value");

        var cookies = response.getHeaders(HttpHeaders.SET_COOKIE);

        assertThat(cookies).hasSize(2);
        assertThat(cookies.get(0)).contains("accessToken=access-value");
        assertThat(cookies.get(1)).contains("refreshToken=refresh-value");
    }
}