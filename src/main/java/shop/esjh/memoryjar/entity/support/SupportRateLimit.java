package shop.esjh.memoryjar.entity.support;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.time.Duration;

/** 같은 접수자만 짧게 직렬화하는 DB 카운터다. 여러 서버에서도 제한과 중복 저장 검사가 일치한다. */
@Entity @Getter @NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "support_rate_limits")
public class SupportRateLimit {
    @Id @Column(length = 64, columnDefinition = "CHAR(64)") private String rateKey;
    @Column(nullable = false) private LocalDateTime windowStart;
    @Column(nullable = false) private int usedCount;
    @Column(nullable = false) private LocalDateTime updatedAt;
    public void touch(LocalDateTime now) { updatedAt = now; }
    public boolean consume(int limit, Duration period, LocalDateTime now) {
        touch(now);
        if (!windowStart.plus(period).isAfter(now)) { windowStart = now; usedCount = 0; }
        if (usedCount >= limit) return false;
        usedCount++; return true;
    }
}
