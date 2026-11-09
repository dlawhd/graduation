package shop.esjh.memoryjar.repository;

import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.SecurityRequestLimit;

/** 처음 요청한 식별자의 카운터도 중복 INSERT 오류 없이 만들고, 짧은 행 잠금으로 예산을 확보한다. */
public interface SecurityRequestLimitRepository extends JpaRepository<SecurityRequestLimit, String> {
    // 중복 키에서도 배타 잠금을 먼저 확보해 INSERT IGNORE의 공유→배타 승격 교착을 피한다.
    @Modifying
    @Query(value = "INSERT INTO security_request_limits(budget_key, window_start, used_count, updated_at) VALUES (:key,:now,0,:now) ON DUPLICATE KEY UPDATE budget_key=budget_key", nativeQuery = true)
    void ensure(@Param("key") String key, @Param("now") LocalDateTime now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from SecurityRequestLimit b where b.budgetKey=:key")
    Optional<SecurityRequestLimit> lock(@Param("key") String key);

    @Modifying
    @Query(value = "DELETE FROM security_request_limits WHERE updated_at < :cutoff ORDER BY updated_at LIMIT 500", nativeQuery = true)
    int deleteExpiredBatch(@Param("cutoff") LocalDateTime cutoff);
}
