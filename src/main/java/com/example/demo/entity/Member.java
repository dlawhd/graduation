package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDateTime;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@Entity
@SQLDelete(sql = "UPDATE members SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
@Table(
        name = "members",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_members_email", columnNames = "email"),
                @UniqueConstraint(name = "uk_members_provider_provider_id", columnNames = {"provider", "provider_id"})
        }
)
public class Member extends BaseEntity{

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = true, length = 255)
    private String email;

    @Column(nullable = true, length = 50)
    private String name;

    @Column(nullable = true, length = 10)
    private String birthyear;

    @Column(nullable = false, length = 20)
    private String provider; // "NAVER"

    @Column(name = "provider_id", nullable = false, length = 100)
    private String providerId; // 네이버 고유 ID

    public void updateProfile(String email, String name, String birthyear) {
        // 최신 값으로 업데이트(없으면 유지)
        if (email != null) this.email = email;
        if (name != null) this.name = name;
        if (birthyear != null) this.birthyear = birthyear;
    }
}