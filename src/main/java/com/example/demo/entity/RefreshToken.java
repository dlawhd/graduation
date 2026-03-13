package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@Entity
@Table(
        name = "refresh_tokens",

        // ✅ 같은 refresh 토큰 해시가 2개 생기면 안 되니까 unique 제약 조건을 걸어둠.
        uniqueConstraints = @UniqueConstraint(
                name = "uk_refresh_tokens_token_hash",
                columnNames = "token_hash"
        ),

        // ✅ 조회 성능을 높이기 위한 인덱스
        indexes = {
                @Index(name = "idx_refresh_tokens_member_id", columnList = "member_id"),
                @Index(name = "idx_refresh_tokens_expires_at", columnList = "expires_at")
        }
)
public class RefreshToken extends BaseEntity{

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "token_id")
    private Long id;

    //        ManyToOne:
    //     * - refresh 토큰은 여러 개가 한 회원에게 연결될 수 있음
    //     * - 한 회원(Member) : 여러 RefreshToken
    //     * fetch = LAZY:
    //     * - 꼭 필요할 때만 member를 DB에서 가져오겠다는 뜻
    //     * optional = false:
    //     * - 회원 없는 refresh 토큰은 존재하면 안 됨
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "member_id",
            nullable = false,
            foreignKey = @ForeignKey(name = "fk_refresh_tokens_member")
    )
    private Member member;

    // ✅ refresh 토큰의 해시값(SHA-256)
    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    // ✅ refresh 토큰이 만료되는 시간
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    // ✅ refresh 폐기된 시간을 저장하는 칸
    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    // ✅ 이 토큰이 "지금 사용 가능한 토큰인지" 검사
    public boolean isActive(LocalDateTime now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }

    // ✅ refresh 폐기된 시간을 저장하는 칸
    public void revokeNow() {
        this.revokedAt = LocalDateTime.now();
    }
}