package shop.esjh.memoryjar.repository.jar;

import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.jar.JarOpenEvent;
import shop.esjh.memoryjar.enums.jar.JarOpenReason;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
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
 * JarOpenEventRepository의 오픈 이력 존재 여부와 단건 조회를 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class JarOpenEventRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private JarOpenEventRepository jarOpenEventRepository;

    @Test
    @DisplayName("existsByJar_JarId는 오픈 이력이 있으면 true를 반환한다")
    void existsByJarId_returnsTrueWhenOpenEventExists() {
        User owner = saveUser("owner-open-exists", "owner-open-exists@example.com", "owner");
        Jar jar = saveJar(owner, "open-event-jar", LocalDateTime.now().minusHours(1));
        saveJarOpenEvent(jar, LocalDateTime.now(), JarOpenReason.SCHEDULED);

        flushAndClear();

        assertThat(jarOpenEventRepository.existsByJar_JarId(jar.getJarId())).isTrue();
        assertThat(jarOpenEventRepository.existsByJar_JarId(jar.getJarId() + 999)).isFalse();
    }

    @Test
    @DisplayName("findByJar_JarId는 해당 저금통의 오픈 이력을 조회한다")
    void findByJarId_returnsOpenEvent() {
        User owner = saveUser("owner-open-find", "owner-open-find@example.com", "owner");
        Jar jar = saveJar(owner, "open-find-jar", LocalDateTime.now().minusHours(2));
        saveJarOpenEvent(jar, LocalDateTime.now().minusMinutes(10), JarOpenReason.ACCESS_TRIGGERED);

        flushAndClear();

        assertThat(jarOpenEventRepository.findByJar_JarId(jar.getJarId()))
                .isPresent()
                .get()
                .extracting(JarOpenEvent::getReason)
                .isEqualTo(JarOpenReason.ACCESS_TRIGGERED);
    }

    @Test
    @DisplayName("findOpenedJarIdsByJarIds는 여러 저금통 중 오픈 이력이 있는 저금통 ID만 반환한다")
    void findOpenedJarIdsByJarIds_returnsOnlyOpenedJarIds() {
        // given
        User owner = saveUser("owner-opened-list", "owner-opened-list@example.com", "owner");

        Jar openedJar1 = saveJar(owner, "opened-jar-1", LocalDateTime.now().minusDays(2));
        Jar unopenedJar = saveJar(owner, "unopened-jar", LocalDateTime.now().plusDays(1));
        Jar openedJar2 = saveJar(owner, "opened-jar-2", LocalDateTime.now().minusDays(1));

        jarOpenEventRepository.save(
                JarOpenEvent.create(openedJar1, LocalDateTime.now().minusDays(2), JarOpenReason.ACCESS_TRIGGERED)
        );
        jarOpenEventRepository.save(
                JarOpenEvent.create(openedJar2, LocalDateTime.now().minusDays(1), JarOpenReason.ACCESS_TRIGGERED)
        );

        entityManager.flush();
        entityManager.clear();

        // when
        List<Long> openedJarIds = jarOpenEventRepository.findOpenedJarIdsByJarIds(
                List.of(
                        openedJar1.getJarId(),
                        unopenedJar.getJarId(),
                        openedJar2.getJarId()
                )
        );

        // then
        assertThat(openedJarIds)
                .containsExactlyInAnyOrder(
                        openedJar1.getJarId(),
                        openedJar2.getJarId()
                );

        assertThat(openedJarIds)
                .doesNotContain(unopenedJar.getJarId());
    }
}
