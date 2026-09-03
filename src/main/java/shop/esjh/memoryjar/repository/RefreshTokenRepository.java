package shop.esjh.memoryjar.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.RefreshToken;
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

    /*
     * refresh 토큰 회전용 잠금 조회야.
     *
     * PESSIMISTIC_WRITE:
     * - 먼저 조회한 요청이 이 토큰 행을 잠가.
     * - 다른 요청은 첫 번째 요청의 작업이 끝날 때까지 기다려.
     *
     * 중요한 점:
     * 쿼리 조건에 revokedAt이나 expiresAt을 넣지 않아.
     *
     * 기다리던 두 번째 요청이 잠금을 얻은 뒤,
     * 토큰의 최신 폐기 상태를 직접 검사해야 하기 때문이야.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT refreshToken
            FROM RefreshToken refreshToken
            WHERE refreshToken.tokenHash = :tokenHash
            """)
    Optional<RefreshToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    /*
     * =========================================================
     * 특정 User의 모든 Refresh Token 폐기
     * =========================================================
     *
     * 비밀번호 재설정 성공 후 사용한다.
     *
     * 사용자의 Token을 하나씩 Java에서 조회해서
     * for문으로 revoke하는 대신:
     *
     * UPDATE refresh_tokens ...
     *
     * 한 번으로 처리한다.
     *
     * 따라서 Token이 여러 개여도
     * DB 요청 1번으로 끝나서 더 효율적이다.
     */
    @Modifying
    @Query(
            value = """
                UPDATE refresh_tokens
                   SET revoked_at = :revokedAt,
                       updated_at = :revokedAt
                 WHERE user_id = :userId
                   AND revoked_at IS NULL
                   AND deleted_at IS NULL
                """,
            nativeQuery = true
    )
    int revokeAllActiveByUserId(

            @Param("userId")
            Long userId,

            @Param("revokedAt")
            LocalDateTime revokedAt
    );
}