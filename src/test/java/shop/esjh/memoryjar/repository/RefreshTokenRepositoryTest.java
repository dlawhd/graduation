package shop.esjh.memoryjar.repository;

import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.RefreshToken;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest // Repository/JPA만 테스트
@Testcontainers // 테스트할 때 도커로 MariaDB를 띄움
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE) // H2로 바꾸지 말고 내가 지정한 DB 그대로 사용
@Import(JpaAuditConfig.class) // createdAt, updatedAt 같은 감사(Auditing) 기능 켜기
class RefreshTokenRepositoryTest {

    @Container
    static MariaDBContainer<?> mariaDBContainer =
            new MariaDBContainer<>("mariadb:10.11")
                    .withDatabaseName("testdb")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mariaDBContainer::getJdbcUrl);
        registry.add("spring.datasource.username", mariaDBContainer::getUsername);
        registry.add("spring.datasource.password", mariaDBContainer::getPassword);
        registry.add("spring.datasource.driver-class-name", mariaDBContainer::getDriverClassName);
    }

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void findByTokenHash_토큰이_있으면_반환한다() {
        // given
        User user = saveUser("naver-1", "user1@example.com", "은서");
        RefreshToken refreshToken = saveRefreshToken(
                user,
                "hash-123",
                LocalDateTime.now().plusDays(7),
                null
        );

        // when
        Optional<RefreshToken> result = refreshTokenRepository.findByTokenHash("hash-123");

        // then
        assertThat(result).isPresent();
        assertThat(result.get().getId()).isEqualTo(refreshToken.getId());
        assertThat(result.get().getTokenHash()).isEqualTo("hash-123");
    }

    @Test
    void findByTokenHash_토큰이_없으면_empty를_반환한다() {
        // when
        Optional<RefreshToken> result = refreshTokenRepository.findByTokenHash("not-found");

        // then
        assertThat(result).isEmpty();
    }

    @Test
    void findByTokenHashAndRevokedAtIsNull_폐기되지_않은_토큰이면_반환한다() {
        // given
        User user = saveUser("naver-2", "user2@example.com", "종현");
        saveRefreshToken(
                user,
                "hash-active",
                LocalDateTime.now().plusDays(7),
                null
        );

        // when
        Optional<RefreshToken> result =
                refreshTokenRepository.findByTokenHashAndRevokedAtIsNull("hash-active");

        // then
        assertThat(result).isPresent();
        assertThat(result.get().getTokenHash()).isEqualTo("hash-active");
        assertThat(result.get().getRevokedAt()).isNull();
    }

    @Test
    void findByTokenHashAndRevokedAtIsNull_이미_폐기된_토큰이면_empty를_반환한다() {
        // given
        User user = saveUser("naver-3", "user3@example.com", "철수");
        saveRefreshToken(
                user,
                "hash-revoked",
                LocalDateTime.now().plusDays(7),
                LocalDateTime.now()
        );

        // when
        Optional<RefreshToken> result =
                refreshTokenRepository.findByTokenHashAndRevokedAtIsNull("hash-revoked");

        // then
        assertThat(result).isEmpty();
    }

    @Test
    void findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter_사용가능한_토큰이면_반환한다() {
        // given
        User user = saveUser("naver-4", "user4@example.com", "영희");
        LocalDateTime now = LocalDateTime.now();

        saveRefreshToken(
                user,
                "hash-valid",
                now.plusDays(7),
                null
        );

        // when
        Optional<RefreshToken> result =
                refreshTokenRepository.findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(
                        "hash-valid",
                        now
                );

        // then
        assertThat(result).isPresent();
        assertThat(result.get().getTokenHash()).isEqualTo("hash-valid");
    }

    @Test
    void findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter_만료된_토큰이면_empty를_반환한다() {
        // given
        User user = saveUser("naver-5", "user5@example.com", "민수");
        LocalDateTime now = LocalDateTime.now();

        saveRefreshToken(
                user,
                "hash-expired",
                now.minusMinutes(1),
                null
        );

        // when
        Optional<RefreshToken> result =
                refreshTokenRepository.findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(
                        "hash-expired",
                        now
                );

        // then
        assertThat(result).isEmpty();
    }

    @Test
    void findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter_폐기된_토큰이면_empty를_반환한다() {
        // given
        User user = saveUser("naver-6", "user6@example.com", "지민");
        LocalDateTime now = LocalDateTime.now();

        saveRefreshToken(
                user,
                "hash-revoked-validtime",
                now.plusDays(7),
                now
        );

        // when
        Optional<RefreshToken> result =
                refreshTokenRepository.findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(
                        "hash-revoked-validtime",
                        now
                );

        // then
        assertThat(result).isEmpty();
    }

    private User saveUser(String providerId, String email, String name) {
        User user = User.builder()
                .provider("NAVER")
                .providerId(providerId)
                .email(email)
                .name(name)
                .birthyear("2000")
                .build();

        return userRepository.save(user);
    }

    private RefreshToken saveRefreshToken(
            User user,
            String tokenHash,
            LocalDateTime expiresAt,
            LocalDateTime revokedAt
    ) {
        RefreshToken refreshToken = RefreshToken.builder()
                .user(user)
                .tokenHash(tokenHash)
                .expiresAt(expiresAt)
                .revokedAt(revokedAt)
                .build();

        return refreshTokenRepository.save(refreshToken);
    }
}