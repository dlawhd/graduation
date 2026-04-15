package com.example.demo.repository.jar;

import com.example.demo.config.JpaAuditConfig;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.enums.jar.JarOpenReason;
import com.example.demo.enums.jar.JarRole;
import com.example.demo.repository.support.AbstractMariaDbRepositoryTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * JarRepository의 soft delete, 목록 조회, 오픈 대상 조회 쿼리를 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class JarRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private JarRepository jarRepository;

    @Test
    @DisplayName("findByJarId는 삭제되지 않은 저금통을 조회한다")
    void findByJarId_returnsActiveJar() {
        User owner = saveUser("owner-jar-find", "owner-find@example.com", "owner");
        Jar jar = saveJar(owner, "find-jar", LocalDateTime.now().plusDays(3));

        flushAndClear();

        assertThat(jarRepository.findByJarId(jar.getJarId()))
                .isPresent()
                .get()
                .extracting(Jar::getName)
                .isEqualTo("find-jar");
    }

    @Test
    @DisplayName("findByJarId는 soft delete 된 저금통을 제외한다")
    void findByJarId_excludesSoftDeletedJar() {
        User owner = saveUser("owner-jar-delete", "owner-delete@example.com", "owner");
        Jar jar = saveJar(owner, "deleted-jar", LocalDateTime.now().plusDays(3));

        jarRepository.delete(jar);
        flushAndClear();

        assertThat(jarRepository.findByJarId(jar.getJarId())).isEmpty();
    }

    @Test
    @DisplayName("findDetailByJarId는 owner를 함께 조회한다")
    void findDetailByJarId_fetchesOwner() {
        User owner = saveUser("owner-jar-detail", "owner-detail@example.com", "owner-name");
        Jar jar = saveJar(owner, "detail-jar", LocalDateTime.now().plusDays(1));

        flushAndClear();

        assertThat(jarRepository.findDetailByJarId(jar.getJarId()))
                .isPresent()
                .get()
                .extracting(found -> found.getOwner().getName())
                .isEqualTo("owner-name");
    }

    @Test
    @DisplayName("findMyJarsByUserId는 active membership만 updatedAt 내림차순으로 반환한다")
    void findMyJarsByUserId_returnsOnlyActiveJarsInUpdatedOrder() {
        User owner = saveUser("owner-jar-list", "owner-list@example.com", "owner");
        User member = saveUser("member-jar-list", "member-list@example.com", "member");
        Jar olderJar = saveJar(owner, "older-jar", LocalDateTime.now().plusDays(2));
        saveJarMember(olderJar, member, JarRole.MEMBER, LocalDateTime.now().minusDays(2));

        Jar newerJar = saveJar(owner, "newer-jar", LocalDateTime.now().plusDays(3));
        saveJarMember(newerJar, member, JarRole.MEMBER, LocalDateTime.now().minusDays(1));

        Jar leftJar = saveJar(owner, "left-jar", LocalDateTime.now().plusDays(4));
        var leftMember = saveJarMember(leftJar, member, JarRole.MEMBER, LocalDateTime.now());
        leftMember.leave();

        flushAndClear();

        Page<Jar> result = jarRepository.findMyJarsByUserId(member.getId(), PageRequest.of(0, 10));

        assertThat(result.getContent()).extracting(Jar::getName)
                .containsExactly("newer-jar", "older-jar");
    }

    @Test
    @DisplayName("findDueJarsWithoutOpenEvent는 열릴 시간이 지났고 오픈 이력이 없는 저금통만 조회한다")
    void findDueJarsWithoutOpenEvent_returnsOnlyDueJarsWithoutEvent() {
        User owner = saveUser("owner-jar-due", "owner-due@example.com", "owner");
        Jar dueJar = saveJar(owner, "due-jar", LocalDateTime.now().minusHours(1));
        Jar dueButOpenedJar = saveJar(owner, "opened-jar", LocalDateTime.now().minusHours(2));
        Jar futureJar = saveJar(owner, "future-jar", LocalDateTime.now().plusHours(2));
        saveJarOpenEvent(dueButOpenedJar, LocalDateTime.now().minusMinutes(30), JarOpenReason.SCHEDULED);

        flushAndClear();

        List<Jar> result = jarRepository.findDueJarsWithoutOpenEvent(LocalDateTime.now());

        assertThat(result).extracting(Jar::getName).containsExactly("due-jar");
        assertThat(result).extracting(Jar::getJarId)
                .doesNotContain(dueButOpenedJar.getJarId(), futureJar.getJarId());
    }

    @Test
    @DisplayName("existsByJarIdAndOwner_Id는 owner 여부를 확인한다")
    void existsByJarIdAndOwnerId_checksOwnerMatch() {
        User owner = saveUser("owner-jar-owner", "owner-owner@example.com", "owner");
        User other = saveUser("other-jar-owner", "other-owner@example.com", "other");
        Jar jar = saveJar(owner, "owner-check-jar", LocalDateTime.now().plusDays(1));

        flushAndClear();

        assertThat(jarRepository.existsByJarIdAndOwner_Id(jar.getJarId(), owner.getId())).isTrue();
        assertThat(jarRepository.existsByJarIdAndOwner_Id(jar.getJarId(), other.getId())).isFalse();
    }
}
