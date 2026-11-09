package shop.esjh.memoryjar.entity;

import jakarta.persistence.*;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;

/** 로그인·인증메일의 요청 예산을 DB에 보관한다. 이메일·IP 원문 대신 목적별 HMAC 키만 저장한다. */
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "security_request_limits")
public class SecurityRequestLimit {
    @Id @Column(length = 64, columnDefinition = "CHAR(64)") private String budgetKey;
    @Column(nullable = false) private LocalDateTime windowStart;
    @Column(nullable = false) private int usedCount;
    @Column(nullable = false) private LocalDateTime updatedAt;

    /** 행 잠금 안에서만 호출해 여러 서버의 동시 요청도 같은 한도를 사용하게 한다. */
    public boolean consume(int maximum, Duration window, LocalDateTime now) {
        updatedAt = now;
        if (!windowStart.plus(window).isAfter(now)) {
            windowStart = now;
            usedCount = 0;
        }
        if (usedCount >= maximum) return false;
        usedCount++;
        return true;
    }
}
