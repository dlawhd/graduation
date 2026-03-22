package com.example.demo.entity.jar;

import com.example.demo.entity.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import jakarta.persistence.EntityListeners;

import java.time.LocalDateTime;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "jar_invites")
@EntityListeners(AuditingEntityListener.class)
public class JarInvite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "invite_id")
    private Long inviteId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "jar_id", nullable = false)
    private Jar jar;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "code", nullable = false, unique = true, length = 50)
    private String code;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "max_uses", nullable = false)
    private int maxUses;

    @Column(name = "used_count", nullable = false)
    private int usedCount;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private JarInvite(
            Jar jar,
            User createdBy,
            String code,
            LocalDateTime expiresAt,
            int maxUses
    ) {
        this.jar = jar;
        this.createdBy = createdBy;
        this.code = code;
        this.expiresAt = expiresAt;
        this.maxUses = maxUses;
        this.usedCount = 0;
    }

    public boolean isExpired(LocalDateTime now) {
        return this.expiresAt.isBefore(now);
    }

    public boolean isRevoked() {
        return this.revokedAt != null;
    }

    public boolean isExhausted() {
        return this.usedCount >= this.maxUses;
    }

    public boolean isAvailable(LocalDateTime now) {
        return !isExpired(now) && !isRevoked() && !isExhausted();
    }

    public void increaseUsedCount() {
        if (isExhausted()) {
            throw new IllegalStateException("이미 최대 사용 횟수를 모두 사용한 초대장이야.");
        }
        this.usedCount++;
    }

    public void revoke() {
        this.revokedAt = LocalDateTime.now();
    }
}