package com.example.demo.entity.jar;

import com.example.demo.entity.BaseEntity;
import com.example.demo.entity.User;
import com.example.demo.enums.jar.JarRole;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDateTime;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(
        name = "jar_members",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_jar_members_jar_id_user_id",
                        columnNames = {"jar_id", "user_id"}
                )
        }
)
@SQLDelete(sql = "UPDATE jar_members SET deleted_at = NOW(), updated_at = NOW(), left_at = NOW() WHERE jar_member_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class JarMember extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "jar_member_id")
    private Long jarMemberId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "jar_id", nullable = false)
    private Jar jar;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private JarRole role;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @Column(name = "left_at")
    private LocalDateTime leftAt;

    @Builder
    private JarMember(
            Jar jar,
            User user,
            JarRole role,
            LocalDateTime joinedAt
    ) {
        this.jar = jar;
        this.user = user;
        this.role = role;
        this.joinedAt = joinedAt;
        this.leftAt = null;
    }

    public static JarMember createOwner(Jar jar, User user) {
        return JarMember.builder()
                .jar(jar)
                .user(user)
                .role(JarRole.OWNER)
                .joinedAt(LocalDateTime.now())
                .build();
    }

    public static JarMember createMember(Jar jar, User user) {
        return JarMember.builder()
                .jar(jar)
                .user(user)
                .role(JarRole.MEMBER)
                .joinedAt(LocalDateTime.now())
                .build();
    }

    public void changeRole(JarRole role) {
        this.role = role;
    }

    public void leave() {
        this.leftAt = LocalDateTime.now();
        this.softDelete();
    }

    public void rejoin() {
        this.joinedAt = LocalDateTime.now();
        this.leftAt = null;
        this.restore();
    }

    public boolean isActive() {
        return !this.isDeleted() && this.leftAt == null;
    }

    public boolean isOwner() {
        return this.role == JarRole.OWNER;
    }

    public boolean isAdminOrOwner() {
        return this.role == JarRole.OWNER || this.role == JarRole.ADMIN;
    }
}