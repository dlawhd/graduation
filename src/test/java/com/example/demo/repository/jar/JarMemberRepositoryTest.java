package com.example.demo.repository.jar;

import com.example.demo.config.JpaAuditConfig;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.jar.JarMember;
import com.example.demo.enums.jar.JarRole;
import com.example.demo.repository.support.AbstractMariaDbRepositoryTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * JarMemberRepository의 active membership 조회 조건과 정렬을 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class JarMemberRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private JarMemberRepository jarMemberRepository;

    @Test
    @DisplayName("existsByJar_JarIdAndUser_IdAndDeletedAtIsNull은 active 멤버 여부를 반환한다")
    void existsByJarIdAndUserIdAndDeletedAtIsNull_checksActiveMembership() {
        User owner = saveUser("owner-member-exists", "owner-member-exists@example.com", "owner");
        User member = saveUser("member-exists", "member-exists@example.com", "member");
        Jar jar = saveJar(owner, "member-exists-jar", LocalDateTime.now().plusDays(1));
        saveJarMember(jar, member, JarRole.MEMBER, LocalDateTime.now());

        flushAndClear();

        assertThat(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jar.getJarId(), member.getId()))
                .isTrue();
    }

    @Test
    @DisplayName("findByJar_JarIdAndUser_IdAndDeletedAtIsNull은 나간 멤버를 제외한다")
    void findByJarIdAndUserIdAndDeletedAtIsNull_excludesLeftMember() {
        User owner = saveUser("owner-member-left", "owner-member-left@example.com", "owner");
        User member = saveUser("member-left", "member-left@example.com", "member");
        Jar jar = saveJar(owner, "member-left-jar", LocalDateTime.now().plusDays(1));
        JarMember jarMember = saveJarMember(jar, member, JarRole.MEMBER, LocalDateTime.now());
        jarMember.leave();

        flushAndClear();

        assertThat(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(jar.getJarId(), member.getId()))
                .isEmpty();
    }

    @Test
    @DisplayName("countByJar_JarIdAndDeletedAtIsNull은 active 멤버 수만 센다")
    void countByJarIdAndDeletedAtIsNull_countsOnlyActiveMembers() {
        User owner = saveUser("owner-member-count", "owner-member-count@example.com", "owner");
        User activeMember = saveUser("active-member-count", "active-member-count@example.com", "active");
        User leftMember = saveUser("left-member-count", "left-member-count@example.com", "left");
        Jar jar = saveJar(owner, "member-count-jar", LocalDateTime.now().plusDays(1));

        saveJarMember(jar, owner, JarRole.OWNER, LocalDateTime.now().minusDays(2));
        saveJarMember(jar, activeMember, JarRole.MEMBER, LocalDateTime.now().minusDays(1));
        JarMember leftJarMember = saveJarMember(jar, leftMember, JarRole.MEMBER, LocalDateTime.now());
        leftJarMember.leave();

        flushAndClear();

        assertThat(jarMemberRepository.countByJar_JarIdAndDeletedAtIsNull(jar.getJarId())).isEqualTo(2);
    }

    @Test
    @DisplayName("findActiveMembersWithUserByJarId는 active 멤버를 joinedAt 오름차순으로 반환한다")
    void findActiveMembersWithUserByJarId_returnsActiveMembersInJoinedOrder() {
        User owner = saveUser("owner-member-list", "owner-member-list@example.com", "owner");
        User firstMember = saveUser("first-member-list", "first-member-list@example.com", "first");
        User secondMember = saveUser("second-member-list", "second-member-list@example.com", "second");
        User leftMember = saveUser("left-member-list", "left-member-list@example.com", "left");
        Jar jar = saveJar(owner, "member-list-jar", LocalDateTime.now().plusDays(1));

        saveJarMember(jar, owner, JarRole.OWNER, LocalDateTime.now().minusDays(3));
        saveJarMember(jar, firstMember, JarRole.ADMIN, LocalDateTime.now().minusDays(2));
        saveJarMember(jar, secondMember, JarRole.MEMBER, LocalDateTime.now().minusDays(1));
        JarMember leftJarMember = saveJarMember(jar, leftMember, JarRole.MEMBER, LocalDateTime.now());
        leftJarMember.leave();

        flushAndClear();

        List<JarMember> result = jarMemberRepository.findActiveMembersWithUserByJarId(jar.getJarId());

        assertThat(result).extracting(member -> member.getUser().getName())
                .containsExactly("owner", "first", "second");
    }

    @Test
    @DisplayName("findActiveRoleByJarIdAndUserId는 active 멤버의 역할만 반환한다")
    void findActiveRoleByJarIdAndUserId_returnsOnlyActiveRole() {
        User owner = saveUser("owner-member-role", "owner-member-role@example.com", "owner");
        User admin = saveUser("admin-member-role", "admin-member-role@example.com", "admin");
        User left = saveUser("left-member-role", "left-member-role@example.com", "left");
        Jar jar = saveJar(owner, "member-role-jar", LocalDateTime.now().plusDays(1));

        saveJarMember(jar, admin, JarRole.ADMIN, LocalDateTime.now());
        JarMember leftMember = saveJarMember(jar, left, JarRole.MEMBER, LocalDateTime.now());
        leftMember.leave();

        flushAndClear();

        assertThat(jarMemberRepository.findActiveRoleByJarIdAndUserId(jar.getJarId(), admin.getId()))
                .isPresent()
                .get()
                .extracting(JarMember::getRole)
                .isEqualTo(JarRole.ADMIN);
        assertThat(jarMemberRepository.findActiveRoleByJarIdAndUserId(jar.getJarId(), left.getId())).isEmpty();
    }
}
