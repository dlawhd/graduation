package com.example.demo.service;

import com.example.demo.auth.TokenCrypto;
import com.example.demo.config.JwtProperties;
import com.example.demo.entity.Member;
import com.example.demo.entity.RefreshToken;
import com.example.demo.repository.RefreshTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

// refresh 토큰을 발급하고, 검증하고, 예전 refresh는 폐기하고 새 refresh로 바꿔주기(회전), 폐기하는 핵심 서비스
@Service
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtProperties jwtProperties;

    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository,
                               JwtProperties jwtProperties) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.jwtProperties = jwtProperties;
    }

    // ✅ 로그인 성공 시 refresh 토큰 발급 + DB 저장
    @Transactional
    public String issue(Member member) {

        // ✅ 브라우저에 저장할 refresh 토큰 원본 생성
        String raw = TokenCrypto.generateRefreshRaw();

        // ✅ DB에는 원본 대신 해시값 저장
        String hash = TokenCrypto.sha256Hex(raw);

        // ✅ RefreshToken 엔티티 만들기
        RefreshToken entity = RefreshToken.builder()
                .member(member)
                .tokenHash(hash)
                .expiresAt(LocalDateTime.now().plusSeconds(jwtProperties.getRefreshExpSeconds())) // 만료 시간(지금으로부터 14일 뒤)
                .build();

        refreshTokenRepository.save(entity);
        return raw; // ✅ 쿠키에 넣어줄 원본 refresh 토큰 반환
    }

    // ✅ /api/auth/refresh 에서 refresh 토큰 검증 + 회전(rotation)
    @Transactional
    public Rotation rotate(String refreshRaw) {

        // ✅ 브라우저가 보낸 refresh 원본을 해시로 변환
        String hash = TokenCrypto.sha256Hex(refreshRaw);

        // ✅ 이 refresh 토큰이 진짜 사용 가능한 토큰인지 DB에서 찾기
        RefreshToken old = refreshTokenRepository
                .findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(hash, LocalDateTime.now())
                .orElseThrow(() -> new IllegalArgumentException("refresh 토큰이 유효하지 않음"));

        // ✅ 1) 기존 refresh 토큰 폐기
        old.revokeNow();

        // ✅ 2) 새 refresh 토큰도 같은 회원에게 발급해야 하니까 기존 토큰의 주인(member) 가져오기
        Member member = old.getMember();

        // ✅ 새 refresh 토큰 원본 생성
        String newRaw = TokenCrypto.generateRefreshRaw();

        // ✅ 새 refresh 토큰 해시 생성
        String newHash = TokenCrypto.sha256Hex(newRaw);

        // ✅ 새 refresh 토큰 엔티티 만들기
        RefreshToken next = RefreshToken.builder()
                .member(member)
                .tokenHash(newHash)
                .expiresAt(LocalDateTime.now().plusSeconds(jwtProperties.getRefreshExpSeconds()))
                .build();

        refreshTokenRepository.save(next);

        return new Rotation(member, newRaw);
    }

    // ✅ 로그아웃 시 refresh 토큰 폐기
    @Transactional
    public void revokeIfPresent(String refreshRaw) {

        // ✅ refresh 토큰이 없으면 그냥 종료
        if (refreshRaw == null || refreshRaw.isBlank()) return;

        // ✅ 원본 refresh 토큰을 해시로 변환
        String hash = TokenCrypto.sha256Hex(refreshRaw);

        // ✅ DB에서 유효한 refresh 토큰 찾기
        // 있으면 revokeNow() 실행, 없으면 아무 일도 안 함
        refreshTokenRepository
                .findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(hash, LocalDateTime.now())
                .ifPresent(RefreshToken::revokeNow);
    }

    // 메서드 결과를 여러 개 묶어서 전달하는 작은 데이터 클래스로도 쓰임
    // rotate()에서 여러 값을 반환해야 하는데 자바 메서드는 보통 한 개만 반환하니까 둘을 묶어서 깔끔하게 반환
    public record Rotation(Member member, String newRefreshRaw) {}
}