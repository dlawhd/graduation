package com.example.demo.repository.jar;

import com.example.demo.config.JpaAuditConfig;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.jar.JarInvite;
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
 * JarInviteRepository의 초대 코드 조회와 active invite 필터링 조건을 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class JarInviteRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private JarInviteRepository jarInviteRepository;

    @Test
    @DisplayName("findByCode는 코드로 초대장을 조회한다")
    void findByCode_returnsInvite() {
        User owner = saveUser("owner-invite-find", "owner-invite-find@example.com", "owner");
        Jar jar = saveJar(owner, "invite-find-jar", LocalDateTime.now().plusDays(1));
        saveJarInvite(jar, owner, "INVITE-123", LocalDateTime.now().plusHours(6), 3);

        flushAndClear();

        assertThat(jarInviteRepository.findByCode("INVITE-123"))
                .isPresent()
                .get()
                .extracting(JarInvite::getCode)
                .isEqualTo("INVITE-123");
    }

    @Test
    @DisplayName("findByInviteIdAndJar_JarId는 jar 범위 안에서 초대장을 조회한다")
    void findByInviteIdAndJarId_returnsInviteWithinJar() {
        User owner = saveUser("owner-invite-id", "owner-invite-id@example.com", "owner");
        Jar jar = saveJar(owner, "invite-id-jar", LocalDateTime.now().plusDays(1));
        JarInvite invite = saveJarInvite(jar, owner, "INVITE-234", LocalDateTime.now().plusHours(6), 3);

        flushAndClear();

        assertThat(jarInviteRepository.findByInviteIdAndJar_JarId(invite.getInviteId(), jar.getJarId())).isPresent();
        assertThat(jarInviteRepository.findByInviteIdAndJar_JarId(invite.getInviteId(), jar.getJarId() + 999)).isEmpty();
    }

    @Test
    @DisplayName("findAllByJarIdOrderByCreatedAtDesc는 최신 생성 순으로 반환한다")
    void findAllByJarIdOrderByCreatedAtDesc_returnsNewestFirst() {
        User owner = saveUser("owner-invite-order", "owner-invite-order@example.com", "owner");
        Jar jar = saveJar(owner, "invite-order-jar", LocalDateTime.now().plusDays(1));
        saveJarInvite(jar, owner, "INVITE-OLD", LocalDateTime.now().plusHours(6), 3);
        saveJarInvite(jar, owner, "INVITE-NEW", LocalDateTime.now().plusHours(12), 3);

        flushAndClear();

        List<JarInvite> result = jarInviteRepository.findAllByJarIdOrderByCreatedAtDesc(jar.getJarId());

        assertThat(result).extracting(JarInvite::getCode).containsExactly("INVITE-NEW", "INVITE-OLD");
    }

    @Test
    @DisplayName("findActiveInvitesByJarId는 만료, 폐기, 소진된 초대장을 제외한다")
    void findActiveInvitesByJarId_filtersInactiveInvites() {
        User owner = saveUser("owner-invite-active", "owner-invite-active@example.com", "owner");
        Jar jar = saveJar(owner, "invite-active-jar", LocalDateTime.now().plusDays(1));

        saveJarInvite(jar, owner, "INVITE-ACTIVE", LocalDateTime.now().plusHours(6), 3);

        JarInvite revokedInvite = saveJarInvite(jar, owner, "INVITE-REVOKED", LocalDateTime.now().plusHours(6), 3);
        revokedInvite.revoke();

        JarInvite exhaustedInvite = saveJarInvite(jar, owner, "INVITE-USED", LocalDateTime.now().plusHours(6), 1);
        exhaustedInvite.increaseUsedCount();

        saveJarInvite(jar, owner, "INVITE-EXPIRED", LocalDateTime.now().minusHours(1), 3);

        entityManager.flush();
        entityManager.clear();

        List<JarInvite> result = jarInviteRepository.findActiveInvitesByJarId(jar.getJarId(), LocalDateTime.now());

        assertThat(result).extracting(JarInvite::getCode).containsExactly("INVITE-ACTIVE");
    }
}
