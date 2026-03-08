package com.example.demo.controller;

import com.example.demo.service.AuthCookieService;
import com.example.demo.service.RefreshTokenService;
import com.example.demo.entity.Member;
import com.example.demo.jwt.JwtTokenProvider;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

// 로그인 이후 토큰을 어떻게 유지하고 끝낼지"를 처리하는 클래스
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final RefreshTokenService refreshTokenService;
    private final AuthCookieService authCookieService;
    private final JwtTokenProvider jwtTokenProvider;

    // ✅ 생성자 주입
    public AuthController(
            RefreshTokenService refreshTokenService,
            AuthCookieService authCookieService,
            JwtTokenProvider jwtTokenProvider
    ) {
        this.refreshTokenService = refreshTokenService;
        this.authCookieService = authCookieService;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    // ✅ POST /api/auth/refresh
    // 출입증(accessToken)이 만료되기 전에 재발급 쿠폰(refreshToken)으로 새 출입증을 다시 받는 API
    @PostMapping("/refresh")
    public Map<String, Object> refresh(

            // ✅ 브라우저 쿠키에서 refreshToken 꺼내기
            // required = false : 쿠키가 없어도 일단 메서드 진입은 가능, 대신 아래에서 직접 검사해서 401 처리함
            @CookieValue(name = "refreshToken", required = false) String refreshToken,

            // ✅ 응답 객체
            // 나중에 여기다가 accessToken / refreshToken 쿠키를 다시 심어줌
            HttpServletResponse response
    ) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ResponseStatusException(UNAUTHORIZED, "refreshToken 쿠키가 없음");
        }

        // ✅ refreshToken 회전 결과를 담을 변수
        // rotation 안에는 보통: 어떤 회원(member)인지, 새로 발급된 refreshToken 원본(newRefreshRaw)이 들어있음.
        RefreshTokenService.Rotation rotation;
        try {

            // ✅ refreshToken 검증 + 회전(rotation)
            // 1. 쿠키로 받은 refreshToken 원본을 해시로 바꿈
            // 2. DB에서 해당 토큰이 유효한지 확인
            // 3. 기존 refreshToken은 revoked 처리
            // 4. 새 refreshToken 발급
            rotation = refreshTokenService.rotate(refreshToken);
        } catch (IllegalArgumentException e) {

            // ✅ 유효하지 않은 refreshToken이면 401
            throw new ResponseStatusException(UNAUTHORIZED, e.getMessage());
        }

        // ✅ 이 refreshToken의 주인이 누구인지 꺼내기
        // refreshToken이 유효하면 이 토큰은 어떤 회원 것인지 알 수 있음.
        Member member = rotation.member();

        // ✅ subject는 memberId (너 필터가 subject를 memberId로 읽고 있음)
        String subject = String.valueOf(member.getId());

        // ✅ accessToken 안에 넣을 사용자 정보(claims)
        Map<String, Object> claims = new HashMap<>();
        claims.put("email", member.getEmail());
        claims.put("name", member.getName());
        claims.put("birthyear", String.valueOf(member.getBirthyear())); // 타입에 맞게 조정

        // ✅ 새 accessToken 발급
        String newAccess = jwtTokenProvider.createAccessToken(subject, claims);

        // ✅ 새 쿠키 저장(새 access + 새 refresh)
        authCookieService.setAccessCookie(response, newAccess);
        authCookieService.setRefreshCookie(response, rotation.newRefreshRaw());

        return Map.of("ok", true);
    }

    // ✅ POST /api/auth/logout
    // 현재 refreshToken을 폐기(revoked_at 찍기), accessToken 쿠키 삭제, refreshToken 쿠키 삭제
    @PostMapping("/logout")
    public Map<String, Object> logout(
            // ✅ 브라우저 쿠키에서 refreshToken 읽기
            @CookieValue(name = "refreshToken", required = false) String refreshToken,

            // 여기다가 access/refresh 쿠키 삭제 명령(Set-Cookie maxAge=0)을 넣음
            HttpServletResponse response
    ) {
        refreshTokenService.revokeIfPresent(refreshToken);
        authCookieService.clearAccessCookie(response);
        authCookieService.clearRefreshCookie(response);

        return Map.of("ok", true);
    }
}