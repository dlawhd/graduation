package com.example.demo.service;

import com.example.demo.config.properties.AppProperties;
import com.example.demo.config.properties.JwtProperties;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

// accessToken / refreshToken 쿠키를 브라우저에 "저장"하거나 "삭제"하는 일을 담당
@Component
public class AuthCookieService {

    private final JwtProperties jwtProperties;
    private final AppProperties appProperties;

    public AuthCookieService(JwtProperties jwtProperties,
                             AppProperties appProperties) {
        this.jwtProperties = jwtProperties;
        this.appProperties = appProperties;
    }

    // ✅ 공통 쿠키 생성 메서드
    private ResponseCookie createCookie(
            String name,
            String value,
            String path,
            Duration maxAge
    ) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(appProperties.getCookie().isSecure())
                .sameSite(appProperties.getCookie().getSameSite())
                .path(path)
                .maxAge(maxAge);

        // ✅ domain 값이 비어있지 않을 때만 넣기
        String domain = appProperties.getCookie().getDomain();
        if (domain != null && !domain.isBlank()) {
            builder.domain(domain);
        }

        return builder.build();
    }
    // ✅ accessToken 쿠키 저장
    // accessToken이라는 이름의 쿠키를 만들고 응답 헤더(Set-Cookie)에 넣어서 브라우저가 저장하게 함
    public void setAccessCookie(HttpServletResponse response, String accessJwt) {

        // ✅ accessToken 쿠키 만들기
        ResponseCookie cookie = createCookie(
                "accessToken",
                accessJwt,
                "/",
                Duration.ofSeconds(jwtProperties.getAccessExpSeconds())
        );

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    // ✅ refreshToken 쿠키 저장
    // refreshToken이라는 이름의 쿠키를 만들고 응답 헤더(Set-Cookie)에 넣어서 브라우저가 저장하게 함
    public void setRefreshCookie(HttpServletResponse response, String refreshRaw) {

        // ✅ refreshToken 쿠키 만들기
        ResponseCookie cookie = createCookie(
                "refreshToken",
                refreshRaw,
                "/api",
                Duration.ofSeconds(jwtProperties.getRefreshExpSeconds())
        );

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    // ✅ accessToken 쿠키 삭제
    // 같은 이름의 쿠키를 다시 보내되 값은 빈 문자열("") maxAge(0)으로 줘서 브라우저가 즉시 삭제하게 만듦
    public void clearAccessCookie(HttpServletResponse response) {

        // ✅ "삭제용 accessToken 쿠키" 만들기
        ResponseCookie cookie = createCookie(
                "accessToken",
                "",
                "/",
                Duration.ZERO
        );

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    // ✅ refreshToken 쿠키 삭제
    // refreshToken 이름으로 빈 값 + maxAge(0) 쿠키를 내려서 브라우저가 즉시 삭제하게 함
    public void clearRefreshCookie(HttpServletResponse response) {

        // ✅ "삭제용 refreshToken 쿠키" 만들기
        ResponseCookie cookie = createCookie(
                "refreshToken",
                "",
                "/api",
                Duration.ZERO
        );

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    // ✅ JSESSIONID 쿠키 삭제
    // 스프링 시큐리티 세션까지 완전히 끊기 위해 세션 쿠키도 함께 삭제
    public void clearSessionCookie(HttpServletResponse response) {

        // ✅ "삭제용 JSESSIONID 쿠키" 만들기
        ResponseCookie cookie = createCookie(
                "JSESSIONID",
                "",
                "/",
                Duration.ZERO
        );

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}