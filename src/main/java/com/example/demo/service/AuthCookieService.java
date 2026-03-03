package com.example.demo.service;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class AuthCookieService {

    // 네 프로젝트가 이미 SameSite=None을 쓰고 있으니 그대로 맞춤
    private static final String SAME_SITE = "None";

    public void setAccessCookie(HttpServletResponse response, String accessJwt) {
        ResponseCookie cookie = ResponseCookie.from("accessToken", accessJwt)
                .httpOnly(true)
                .secure(true)
                .sameSite(SAME_SITE)
                .path("/")
                .maxAge(Duration.ofMinutes(30)) // access 30분
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public void setRefreshCookie(HttpServletResponse response, String refreshRaw) {
        ResponseCookie cookie = ResponseCookie.from("refreshToken", refreshRaw)
                .httpOnly(true)
                .secure(true)
                .sameSite(SAME_SITE)
                .path("/api")                 // refresh는 API에만 실리게(원하면 "/"로 바꿔도 됨)
                .maxAge(Duration.ofDays(14))  // refresh 14일
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public void clearAccessCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from("accessToken", "")
                .httpOnly(true)
                .secure(true)
                .sameSite(SAME_SITE)
                .path("/")
                .maxAge(0)
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public void clearRefreshCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from("refreshToken", "")
                .httpOnly(true)
                .secure(true)
                .sameSite(SAME_SITE)
                .path("/api")
                .maxAge(0)
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}