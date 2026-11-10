package shop.esjh.memoryjar.entity.support;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.*;

/** 운영자 인증 앱의 암호화된 비밀키와 일회용 복구 코드 해시를 보관한다. 원문 코드는 저장하지 않는다. */
@Entity
@Table(name = "operator_mfa_credentials")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OperatorMfaCredential {
    @Id private Long userId;
    @Column(length = 512) private String encryptedSecret;
    @Column(length = 512) private String pendingSecret;
    @Column(length = 64, columnDefinition = "CHAR(64)") private String pendingSessionKey;
    private LocalDateTime pendingExpiresAt;
    private LocalDateTime enabledAt;
    private long lastUsedStep = -1;
    @Column(nullable = false, columnDefinition = "TEXT") private String recoveryHashes = "";

    public OperatorMfaCredential(Long userId) { this.userId = userId; }

    /** 최초 등록은 사용자 행 잠금 안에서 시작하며, 아직 확인하지 않은 키로 인증을 허용하지 않는다. */
    public void prepare(String encrypted, String sessionKey, LocalDateTime until) {
        pendingSecret = encrypted; pendingSessionKey = sessionKey; pendingExpiresAt = until;
    }

    public void enable(long step, String hashes, LocalDateTime now) {
        encryptedSecret = pendingSecret; pendingSecret = null; pendingSessionKey = null; pendingExpiresAt = null;
        enabledAt = now; lastUsedStep = step; recoveryHashes = hashes;
    }

    public void consumeStep(long step) { lastUsedStep = step; }
    public void replaceRecoveryHashes(String hashes) { recoveryHashes = hashes; }
}
