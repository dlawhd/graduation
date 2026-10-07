package shop.esjh.memoryjar.repository.support;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.support.SupportInquiryAudit;
import java.time.LocalDateTime;

/** 감사 기록도 무기한 쌓지 않고 한 번에 최대 100건씩 보관 기간이 지난 기록을 지운다. */
public interface SupportInquiryAuditRepository extends JpaRepository<SupportInquiryAudit, Long> {
    @Modifying
    @Query(value = "DELETE FROM support_inquiry_audits WHERE created_at <= :cutoff LIMIT 100", nativeQuery = true)
    int deleteExpiredBatch(@Param("cutoff") LocalDateTime cutoff);
}
