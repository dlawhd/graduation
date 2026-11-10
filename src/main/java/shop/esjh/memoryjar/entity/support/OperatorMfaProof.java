package shop.esjh.memoryjar.entity.support;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.*;

/** 한 기기에서 완료한 추가 인증의 만료 시간을 기록한다. 로그인 쿠키나 인증 코드는 보관하지 않는다. */
@Entity
@Table(name = "operator_mfa_proofs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OperatorMfaProof {
    @Id @Column(length = 64, columnDefinition = "CHAR(64)") private String sessionKey;
    @Column(nullable = false) private Long userId;
    @Column(nullable = false) private long sessionVersion;
    @Column(nullable = false) private LocalDateTime expiresAt;

    public OperatorMfaProof(String sessionKey, Long userId, long version, LocalDateTime until) {
        this.sessionKey = sessionKey; this.userId = userId; this.sessionVersion = version; this.expiresAt = until;
    }
}
