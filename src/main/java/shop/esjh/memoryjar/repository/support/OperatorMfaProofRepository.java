package shop.esjh.memoryjar.repository.support;

import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.support.OperatorMfaProof;

/** 기기별 추가 인증을 확인하고, 만료한 기록은 작은 배치로 정리한다. */
public interface OperatorMfaProofRepository extends JpaRepository<OperatorMfaProof, String> {
    /** 만료 정리가 먼저 행을 지워도 한 SQL로 새 인증을 저장해 갱신 중 500 오류를 피한다. */
    @Modifying
    @Query(value = """
        INSERT INTO operator_mfa_proofs (session_key, user_id, session_version, expires_at)
        VALUES (:key, :userId, :version, :until)
        ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), session_version=VALUES(session_version), expires_at=VALUES(expires_at)
        """, nativeQuery = true)
    int grant(@Param("key") String key, @Param("userId") Long userId, @Param("version") long version,
              @Param("until") LocalDateTime until);

    @Modifying
    @Query("delete from OperatorMfaProof p where p.sessionKey = :key")
    int deleteSession(@Param("key") String key);

    @Query("""
        select p from OperatorMfaProof p where p.sessionKey = :key
          and exists(select c.userId from OperatorMfaCredential c where c.userId = p.userId and c.enabledAt is not null)
        """)
    Optional<OperatorMfaProof> findEnabledProof(@Param("key") String key);

    @Modifying
    @Query(value = "DELETE FROM operator_mfa_proofs WHERE expires_at < :now ORDER BY expires_at LIMIT 500", nativeQuery = true)
    int deleteExpiredBatch(@Param("now") LocalDateTime now);
}
