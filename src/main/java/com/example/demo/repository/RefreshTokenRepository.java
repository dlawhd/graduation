package com.example.demo.repository;

import com.example.demo.entity.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

// DB에서 refresh 토큰을 조건에 맞게 조회해서, 이 토큰이 지금 사용 가능한지 확인하는 역할
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    // ✅ tokenHash로 refresh 토큰 1개 찾기
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    // ✅이 토큰이 DB에 존재하면서, 아직 폐기되지 않았는가?
    Optional<RefreshToken> findByTokenHashAndRevokedAtIsNull(String tokenHash);

    // ✅ tokenHash가 같고, 폐기되지 않았고, 아직 만료되지 않은 refresh 토큰 찾기
    Optional<RefreshToken> findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(
            String tokenHash,
            LocalDateTime now
    );
}