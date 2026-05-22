package shop.esjh.memoryjar.entity.jar;

import shop.esjh.memoryjar.entity.BaseEntity;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.enums.jar.JarRole;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDateTime;
import java.time.ZoneId;

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

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");


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
                .joinedAt(LocalDateTime.now(ZoneId.of("Asia/Seoul")))
                .build();
    }

    public static JarMember createMember(Jar jar, User user) {
        return JarMember.builder()
                .jar(jar)
                .user(user)
                .role(JarRole.MEMBER)
                .joinedAt(LocalDateTime.now(ZoneId.of("Asia/Seoul")))
                .build();
    }

    public void changeRole(JarRole role) {
        this.role = role;
    }

    // 저금통 멤버가 나가거나 강퇴될 때 호출되는 기능
    public void leave() {
        // 사용자가 저금통을 나간 시간을 저장합니다.
        this.leftAt = LocalDateTime.now(KST);

        // 실제 DB row를 지우지 않고, deletedAt에 시간을 찍어 "나간 상태"로 표시합니다.
        this.softDelete();
    }

    public void rejoin() {
        this.joinedAt = LocalDateTime.now(KST);
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