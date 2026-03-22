package com.example.demo.entity;

import com.example.demo.enums.JarLockLevel;
import com.example.demo.enums.JarOpenMode;
import com.example.demo.enums.JarTheme;
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
@Table(name = "jars")
@SQLDelete(sql = "UPDATE jars SET deleted_at = NOW(), updated_at = NOW() WHERE jar_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Jar extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "jar_id")
    private Long jarId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "description", length = 255)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "theme", nullable = false, length = 30)
    private JarTheme theme;

    @Column(name = "max_members", nullable = false)
    private int maxMembers;

    @Column(name = "open_at", nullable = false)
    private LocalDateTime openAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "open_mode", nullable = false, length = 30)
    private JarOpenMode openMode;

    @Enumerated(EnumType.STRING)
    @Column(name = "lock_level", nullable = false, length = 30)
    private JarLockLevel lockLevel;

    @Builder
    private Jar(
            User owner,
            String name,
            String description,
            JarTheme theme,
            int maxMembers,
            LocalDateTime openAt,
            JarOpenMode openMode,
            JarLockLevel lockLevel
    ) {
        this.owner = owner;
        this.name = name;
        this.description = description;
        this.theme = theme;
        this.maxMembers = maxMembers;
        this.openAt = openAt;
        this.openMode = openMode;
        this.lockLevel = lockLevel;
    }

    public void updateInfo(
            String name,
            String description,
            JarTheme theme,
            int maxMembers,
            LocalDateTime openAt,
            JarOpenMode openMode,
            JarLockLevel lockLevel
    ) {
        this.name = name;
        this.description = description;
        this.theme = theme;
        this.maxMembers = maxMembers;
        this.openAt = openAt;
        this.openMode = openMode;
        this.lockLevel = lockLevel;
    }

    public boolean isOwner(Long userId) {
        return owner != null && owner.getId().equals(userId);
    }
}