package shop.esjh.memoryjar.repository;

import jakarta.persistence.PersistenceException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserOAuthAccount;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/*
 * UserOAuthAccountRepositoryTest 역할
 *
 * 실제 MariaDB(Testcontainers)와 Flyway를 사용해서
 * user_oauth_accounts 테이블과 Repository가
 * 제대로 연결되어 있는지 검증하는 테스트야.
 *
 * 주요 검증 내용:
 *
 * 1. provider + providerId로 OAuth 계정을 조회할 수 있는가?
 * 2. 한 User에게 NAVER와 GOOGLE을 동시에 연결할 수 있는가?
 * 3. 같은 OAuth 계정이 두 User에게 중복 연결되는 것을 DB가 막는가?
 * 4. 한 User에게 같은 Provider를 두 번 연결하는 것을 DB가 막는가?
 *
 * Mockito 단위 테스트와 달리
 * 실제 MariaDB의 UNIQUE/FK 제약조건까지 확인한다.
 */
@DataJpaTest(
        properties = "spring.jpa.hibernate.ddl-auto=none"
)
@Testcontainers
@AutoConfigureTestDatabase(
        replace = AutoConfigureTestDatabase.Replace.NONE
)
@Import(JpaAuditConfig.class)
class UserOAuthAccountRepositoryTest
        extends AbstractMariaDbRepositoryTest {

    // 실제 UserOAuthAccount Repository를 Spring에게 주입받는다.
    @Autowired
    private UserOAuthAccountRepository userOAuthAccountRepository;

    /*
     * GOOGLE + Google의 sub 값으로
     * 연결된 OAuth 계정을 찾을 수 있는지 확인한다.
     */
    @Test
    @DisplayName("provider와 providerId로 OAuth 계정을 조회할 수 있다")
    void findByProviderAndProviderId_returnsOAuthAccount() {

        // given

        // Memory Jar 사용자 한 명을 실제 테스트 DB에 저장한다.
        User user = saveUser(
                "legacy-naver-provider-id-1",
                "oauth-find@example.com",
                "OAuth 조회 사용자"
        );

        // 이 사용자에게 Google 로그인 계정을 연결한다.
        saveOAuthAccount(
                user,
                "GOOGLE",
                "google-sub-123"
        );

        /*
         * JPA 1차 캐시를 비워서
         * 아래 조회가 실제 DB를 통해 이루어지도록 한다.
         */
        flushAndClear();

        // when
        UserOAuthAccount result =
                userOAuthAccountRepository
                        .findByProviderAndProviderId(
                                "GOOGLE",
                                "google-sub-123"
                        )
                        .orElseThrow();

        // then
        assertThat(result.getProvider())
                .isEqualTo("GOOGLE");

        assertThat(result.getProviderId())
                .isEqualTo("google-sub-123");

        /*
         * Google 계정이 우리가 저장했던
         * 동일한 Memory Jar User와 연결되어 있는지 확인한다.
         */
        assertThat(result.getUser().getId())
                .isEqualTo(user.getId());
    }

    /*
     * 이번 Google 로그인 기능의 가장 중요한 DB 테스트야.
     *
     * 한 명의 Memory Jar User에게
     * NAVER와 GOOGLE 계정을 동시에 저장할 수 있어야 한다.
     */
    @Test
    @DisplayName("한 사용자는 NAVER와 GOOGLE 계정을 각각 하나씩 연결할 수 있다")
    void oneUser_canHaveNaverAndGoogleAccounts() {

        // given
        User user = saveUser(
                "legacy-naver-provider-id-2",
                "oauth-both@example.com",
                "두 로그인 사용자"
        );

        // 같은 User에게 NAVER 로그인 연결
        saveOAuthAccount(
                user,
                "NAVER",
                "naver-account-123"
        );

        // 같은 User에게 GOOGLE 로그인 연결
        saveOAuthAccount(
                user,
                "GOOGLE",
                "google-account-456"
        );

        flushAndClear();

        // when
        UserOAuthAccount naverAccount =
                userOAuthAccountRepository
                        .findByUser_IdAndProvider(
                                user.getId(),
                                "NAVER"
                        )
                        .orElseThrow();

        UserOAuthAccount googleAccount =
                userOAuthAccountRepository
                        .findByUser_IdAndProvider(
                                user.getId(),
                                "GOOGLE"
                        )
                        .orElseThrow();

        // then

        // NAVER 연결 확인
        assertThat(naverAccount.getUser().getId())
                .isEqualTo(user.getId());

        assertThat(naverAccount.getProvider())
                .isEqualTo("NAVER");

        assertThat(naverAccount.getProviderId())
                .isEqualTo("naver-account-123");

        // GOOGLE 연결 확인
        assertThat(googleAccount.getUser().getId())
                .isEqualTo(user.getId());

        assertThat(googleAccount.getProvider())
                .isEqualTo("GOOGLE");

        assertThat(googleAccount.getProviderId())
                .isEqualTo("google-account-456");
    }

    /*
     * 동일한 Google 계정이
     * 서로 다른 Memory Jar User 두 명에게 연결되는 것을
     * DB UNIQUE 제약조건이 막는지 확인한다.
     *
     * UNIQUE(provider, provider_id)
     */
    @Test
    @DisplayName("같은 OAuth 계정을 서로 다른 사용자에게 중복 연결할 수 없다")
    void duplicateProviderAndProviderId_isRejected() {

        // given
        User firstUser = saveUser(
                "legacy-user-duplicate-1",
                "duplicate-first@example.com",
                "첫 번째 사용자"
        );

        User secondUser = saveUser(
                "legacy-user-duplicate-2",
                "duplicate-second@example.com",
                "두 번째 사용자"
        );

        // 첫 번째 User에게 Google 계정 연결
        saveOAuthAccount(
                firstUser,
                "GOOGLE",
                "same-google-sub"
        );

        /*
         * 첫 번째 INSERT가 DB에 확실히 반영되도록 한다.
         */
        flushAndClear();

        // when & then

        /*
         * 같은 GOOGLE + same-google-sub를
         * 두 번째 User에게 연결하려고 하면
         *
         * UNIQUE(provider, provider_id)
         *
         * 제약조건 때문에 DB가 거부해야 한다.
         */
        assertThatThrownBy(() -> {

            UserOAuthAccount duplicateAccount =
                    UserOAuthAccount.builder()
                            .user(secondUser)
                            .provider("GOOGLE")
                            .providerId("same-google-sub")
                            .build();

            entityManager.persist(duplicateAccount);

            /*
             * persist()만 하면 SQL 실행이 뒤로 미뤄질 수 있기 때문에
             * flush()를 호출해서 지금 즉시 INSERT를 실행시킨다.
             */
            entityManager.flush();
        })
                .isInstanceOf(PersistenceException.class);
    }

    /*
     * 한 User가 같은 Provider 계정을
     * 두 개 연결하지 못하도록 하는 제약조건을 확인한다.
     *
     * UNIQUE(user_id, provider)
     */
    @Test
    @DisplayName("한 사용자는 같은 OAuth Provider를 두 번 연결할 수 없다")
    void sameUserAndProvider_isRejected() {

        // given
        User user = saveUser(
                "legacy-user-provider-duplicate",
                "same-provider@example.com",
                "중복 Provider 사용자"
        );

        // 첫 번째 Google 계정 연결
        saveOAuthAccount(
                user,
                "GOOGLE",
                "google-first"
        );

        flushAndClear();

        // when & then
        assertThatThrownBy(() -> {

            /*
             * 같은 User에게 또 다른 GOOGLE 계정을
             * 하나 더 연결하려고 한다.
             */
            UserOAuthAccount secondGoogleAccount =
                    UserOAuthAccount.builder()
                            .user(user)
                            .provider("GOOGLE")
                            .providerId("google-second")
                            .build();

            entityManager.persist(secondGoogleAccount);

            // DB UNIQUE 제약조건을 즉시 확인한다.
            entityManager.flush();
        })
                .isInstanceOf(PersistenceException.class);
    }

    /*
     * Repository 테스트에서 반복해서 사용할
     * OAuth 계정 저장 도우미 메서드야.
     */
    private UserOAuthAccount saveOAuthAccount(
            User user,
            String provider,
            String providerId
    ) {

        // 저장할 OAuth 연결 엔티티를 만든다.
        UserOAuthAccount oauthAccount =
                UserOAuthAccount.builder()
                        .user(user)
                        .provider(provider)
                        .providerId(providerId)
                        .build();

        /*
         * AbstractMariaDbRepositoryTest의 persist()를 사용한다.
         *
         * persist() 안에서는:
         *
         * entityManager.persist()
         * entityManager.flush()
         *
         * 가 실행되므로 실제 MariaDB에 바로 INSERT된다.
         */
        return persist(oauthAccount);
    }
}