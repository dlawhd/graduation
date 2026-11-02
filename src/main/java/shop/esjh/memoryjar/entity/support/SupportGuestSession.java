package shop.esjh.memoryjar.entity.support;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/** 계정 로그인과 분리된 문의 조회용 세션이다. 임의의 토큰 원문은 DB에 넣지 않는다. */
@Entity @Getter @NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "support_guest_sessions")
public class SupportGuestSession {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long guestSessionId;
    @Column(length = 64, unique = true, columnDefinition = "CHAR(64)") private String tokenHash;
    @Column(nullable = false) private LocalDateTime expiresAt;
    @Column(nullable = false) private LocalDateTime createdAt;
    public SupportGuestSession(String hash, LocalDateTime now) { tokenHash = hash; createdAt = now; expiresAt = now.plusDays(90); }
}
