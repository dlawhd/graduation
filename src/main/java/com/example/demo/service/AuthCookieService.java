package com.example.demo.service;

import com.example.demo.config.JwtProperties;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

// accessToken / refreshToken 쿠키를 브라우저에 "저장"하거나 "삭제"하는 일을 담당
@Component
public class AuthCookieService {

    // ✅ SameSite 설정값
    // SameSite는 브라우저가 쿠키를 언제 같이 보낼지 정하는 옵션
    private static final String SAME_SITE = "None";

    private  final JwtProperties jwtProperties;

    public AuthCookieService(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
    }

    // ✅ accessToken 쿠키 저장
    // accessToken이라는 이름의 쿠키를 만들고 응답 헤더(Set-Cookie)에 넣어서 브라우저가 저장하게 함
    public void setAccessCookie(HttpServletResponse response, String accessJwt) {

        // ✅ accessToken 쿠키 만들기
        ResponseCookie cookie = ResponseCookie.from("accessToken", accessJwt)
                .httpOnly(true) // 자바스크립트(document.cookie)로 이 쿠키를 읽지 못하게 막음 -> XSS 같은 공격에서 토큰 탈취 위험을 줄여줌
                .secure(true) // HTTPS 연결에서만 쿠키를 보내게 함 → 평문 HTTP에서는 쿠키 전송 안 함
                .sameSite(SAME_SITE) // 다른 출처(프론트 ↔ 백엔드) 요청에서도 쿠키 전송 가능하게 함
                .path("/")
                .maxAge(Duration.ofSeconds(jwtProperties.getAccessExpSeconds())) // accessToken 쿠키의 유지 시간, 30분
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    // ✅ refreshToken 쿠키 저장
    // refreshToken이라는 이름의 쿠키를 만들고 응답 헤더(Set-Cookie)에 넣어서 브라우저가 저장하게 함
    public void setRefreshCookie(HttpServletResponse response, String refreshRaw) {

        // ✅ refreshToken 쿠키 만들기
        ResponseCookie cookie = ResponseCookie.from("refreshToken", refreshRaw)
                .httpOnly(true)
                .secure(true)
                .sameSite(SAME_SITE)
                .path("/api")                 // refresh는 API에만 실리게
                .maxAge(Duration.ofSeconds(jwtProperties.getRefreshExpSeconds()))  // refresh 14일
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    // ✅ accessToken 쿠키 삭제
    // 같은 이름의 쿠키를 다시 보내되 값은 빈 문자열("") maxAge(0)으로 줘서 브라우저가 즉시 삭제하게 만듦
    public void clearAccessCookie(HttpServletResponse response) {

        // ✅ "삭제용 accessToken 쿠키" 만들기
        ResponseCookie cookie = ResponseCookie.from("accessToken", "")
                .httpOnly(true)
                .secure(true)
                .sameSite(SAME_SITE)
                .path("/")
                .maxAge(0) // ✅ 즉시 만료 = 삭제
                .build();

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    // ✅ refreshToken 쿠키 삭제
    // refreshToken 이름으로 빈 값 + maxAge(0) 쿠키를 내려서 브라우저가 즉시 삭제하게 함
    public void clearRefreshCookie(HttpServletResponse response) {

        // ✅ "삭제용 refreshToken 쿠키" 만들기
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