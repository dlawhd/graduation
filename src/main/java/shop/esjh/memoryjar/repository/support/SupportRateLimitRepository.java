package shop.esjh.memoryjar.repository.support;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.support.SupportRateLimit;
import java.time.LocalDateTime;
import java.util.Optional;

/** 없는 카운터도 원자적으로 확보한 뒤 행 잠금을 잡는다. 정리는 한 번에 100건으로 제한한다. */
public interface SupportRateLimitRepository extends JpaRepository<SupportRateLimit, String> {
    @Modifying @Query(value = """
        INSERT INTO support_rate_limits(rate_key,window_start,used_count,updated_at) VALUES(:key,:now,0,:now)
        ON DUPLICATE KEY UPDATE rate_key=rate_key
        """, nativeQuery = true)
    void ensure(@Param("key") String key, @Param("now") LocalDateTime now);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select r from SupportRateLimit r where r.rateKey=:key")
    Optional<SupportRateLimit> lock(@Param("key") String key);
    @Modifying @Query(value = "DELETE FROM support_rate_limits WHERE updated_at < :cutoff LIMIT 100", nativeQuery = true)
    int purge(@Param("cutoff") LocalDateTime cutoff);
}
