package com.example.demo.service;

import com.example.demo.auth.TokenCrypto;
import com.example.demo.entity.Member;
import com.example.demo.entity.RefreshToken;
import com.example.demo.repository.RefreshTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;

    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository) {
        this.refreshTokenRepository = refreshTokenRepository;
    }

    // 로그인 성공 시 refresh 발급 + DB 저장(해시)
    @Transactional
    public String issue(Member member) {
        String raw = TokenCrypto.generateRefreshRaw();
        String hash = TokenCrypto.sha256Hex(raw);

        RefreshToken entity = RefreshToken.builder()
                .member(member)
                .tokenHash(hash)
                .expiresAt(LocalDateTime.now().plusDays(14))
                .build();

        refreshTokenRepository.save(entity);
        return raw; // 쿠키에 내려줄 "원본"
    }

    // /api/auth/refresh: refresh 검증 + 회전(rotation)
    @Transactional
    public Rotation rotate(String refreshRaw) {
        String hash = TokenCrypto.sha256Hex(refreshRaw);

        RefreshToken old = refreshTokenRepository
                .findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(hash, LocalDateTime.now())
                .orElseThrow(() -> new IllegalArgumentException("refresh 토큰이 유효하지 않음"));

        // 1) 기존 토큰 폐기
        old.revokeNow();

        // 2) 새 refresh 발급
        Member member = old.getMember();

        String newRaw = TokenCrypto.generateRefreshRaw();
        String newHash = TokenCrypto.sha256Hex(newRaw);

        RefreshToken next = RefreshToken.builder()
                .member(member)
                .tokenHash(newHash)
                .expiresAt(LocalDateTime.now().plusDays(14))
                .build();

        refreshTokenRepository.save(next);

        return new Rotation(member, newRaw);
    }

    // 로그아웃: refresh 폐기(있으면)
    @Transactional
    public void revokeIfPresent(String refreshRaw) {
        if (refreshRaw == null || refreshRaw.isBlank()) return;

        String hash = TokenCrypto.sha256Hex(refreshRaw);

        refreshTokenRepository
                .findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(hash, LocalDateTime.now())
                .ifPresent(RefreshToken::revokeNow);
    }

    public record Rotation(Member member, String newRefreshRaw) {}
}