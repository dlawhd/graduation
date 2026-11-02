package shop.esjh.memoryjar.repository.support;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.support.SupportGuestSession;
import java.util.Optional;
import java.time.LocalDateTime;

/** 토큰 해시로만 본인 세션을 찾는다. 만료된 접근 자격은 제한된 묶음으로 제거한다. */
public interface SupportGuestSessionRepository extends JpaRepository<SupportGuestSession, Long> {
    Optional<SupportGuestSession> findByTokenHashAndExpiresAtAfter(String hash, LocalDateTime now);
    @Modifying @Query(value = "UPDATE support_guest_sessions SET token_hash=NULL WHERE token_hash IS NOT NULL AND expires_at<=:now LIMIT 100", nativeQuery = true)
    int expire(@Param("now") LocalDateTime now);
}
