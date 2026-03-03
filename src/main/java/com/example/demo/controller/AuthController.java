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

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final RefreshTokenService refreshTokenService;
    private final AuthCookieService authCookieService;
    private final JwtTokenProvider jwtTokenProvider;

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
    @PostMapping("/refresh")
    public Map<String, Object> refresh(
            @CookieValue(name = "refreshToken", required = false) String refreshToken,
            HttpServletResponse response
    ) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ResponseStatusException(UNAUTHORIZED, "refreshToken 쿠키가 없음");
        }

        RefreshTokenService.Rotation rotation;
        try {
            rotation = refreshTokenService.rotate(refreshToken);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(UNAUTHORIZED, e.getMessage());
        }

        Member member = rotation.member();

        // ✅ subject는 memberId (너 필터가 subject를 memberId로 읽고 있음)
        String subject = String.valueOf(member.getId());

        Map<String, Object> claims = new HashMap<>();
        claims.put("email", member.getEmail());
        claims.put("name", member.getName());
        claims.put("birthyear", String.valueOf(member.getBirthyear())); // 타입에 맞게 조정

        String newAccess = jwtTokenProvider.createAccessToken(subject, claims);

        // 쿠키 재설정(새 access + 새 refresh)
        authCookieService.setAccessCookie(response, newAccess);
        authCookieService.setRefreshCookie(response, rotation.newRefreshRaw());

        return Map.of("ok", true);
    }

    // ✅ POST /api/auth/logout
    @PostMapping("/logout")
    public Map<String, Object> logout(
            @CookieValue(name = "refreshToken", required = false) String refreshToken,
            HttpServletResponse response
    ) {
        refreshTokenService.revokeIfPresent(refreshToken);

        authCookieService.clearAccessCookie(response);
        authCookieService.clearRefreshCookie(response);

        return Map.of("ok", true);
    }
}