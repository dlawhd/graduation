package com.example.demo.repository.jar;

import com.example.demo.config.JpaAuditConfig;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.jar.JarOpenEvent;
import com.example.demo.enums.jar.JarOpenReason;
import com.example.demo.repository.support.AbstractMariaDbRepositoryTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;

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
}
