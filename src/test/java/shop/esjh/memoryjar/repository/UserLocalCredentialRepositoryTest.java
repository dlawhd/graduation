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
import shop.esjh.memoryjar.entity.UserLocalCredential;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import jakarta.persistence.PersistenceUnitUtil;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/*
 * UserLocalCredentialRepositoryTest 역할
 *
 * Memory Jar 자체 로그인용 Repository와
 * V30의 user_local_credentials 테이블이
 * 실제 MariaDB에서 정상적으로 연결되는지 확인한다.
 *
 * 주요 확인 내용:
 *
 * 1. LOCAL User는 provider/providerId 없이 저장 가능한가?
 * 2. loginId로 LOCAL 로그인 정보를 찾을 수 있는가?
 * 3. 아이디 존재 여부를 확인할 수 있는가?
 * 4. User ID로 LOCAL 로그인 정보를 찾을 수 있는가?
 * 5. 같은 loginId를 두 사람이 사용할 수 없는가?
 * 6. 한 User가 LOCAL 계정을 두 개 가질 수 없는가?
 *
 * Mockito로 흉내내는 테스트가 아니라
 * 실제 MariaDB 10.11 + Flyway를 사용하기 때문에
 * V30 UNIQUE/FK 제약까지 함께 확인한다.
 */
@DataJpaTest
@Testcontainers
@AutoConfigureTestDatabase(
        replace = AutoConfigureTestDatabase.Replace.NONE
)
@Import(JpaAuditConfig.class)
class UserLocalCredentialRepositoryTest
        extends AbstractMariaDbRepositoryTest {


    /*
     * 이번에 새로 만든 LOCAL Credential Repository야.
     */
    @Autowired
    private UserLocalCredentialRepository
            userLocalCredentialRepository;


    /*
     * ========================================================
     * 1. LOCAL User 저장 확인
     * ========================================================
     *
     * V30 이전에는:
     *
     * provider
     * provider_id
     *
     * 가 NOT NULL이라 아래 User를 저장할 수 없었다.
     *
     * 이제는 LOCAL 회원이기 때문에
     * 두 값을 넣지 않아도 정상 저장돼야 한다.
     */
    @Test
    @DisplayName("LOCAL 사용자는 OAuth provider 없이 저장할 수 있다")
    void localUser_canBeSavedWithoutOAuthProvider() {

        // when
        User user =
                saveLocalUser(
                        "local-user@example.com",
                        "LOCAL 사용자"
                );

        // then
        assertThat(
                user.getId()
        ).isNotNull();

        assertThat(
                user.getEmail()
        ).isEqualTo(
                "local-user@example.com"
        );

        /*
         * LOCAL 회원은 OAuth로 가입한 회원이 아니므로
         * provider와 providerId는 NULL이 정상이다.
         */
        assertThat(
                user.getProvider()
        ).isNull();

        assertThat(
                user.getProviderId()
        ).isNull();
    }

    @Test
    @DisplayName("soft delete된 아이디도 신규 회원가입에서 다시 사용할 수 없다")
    void deletedLoginId_isStillReserved() {

        // given
        User user =
                saveLocalUser(
                        "deleted-id@example.com",
                        "삭제 아이디 사용자"
                );

        UserLocalCredential credential =
                saveLocalCredential(
                        user,
                        "reserved01",
                        "$test$password$hash"
                );


        /*
         * 실제 DELETE 대신
         * @SQLDelete에 의해 deleted_at이 기록된다.
         */
        userLocalCredentialRepository.delete(
                credential
        );

        entityManager.flush();
        entityManager.clear();


        /*
         * 일반 조회에서는 soft delete된 데이터가
         * 보이지 않는 것이 정상이다.
         */
        assertThat(
                userLocalCredentialRepository
                        .findByLoginId(
                                "reserved01"
                        )
        ).isEmpty();


        /*
         * 하지만 아이디 사용 가능 여부 검사에서는
         * DB 전체 기록을 확인해야 한다.
         *
         * UNIQUE(login_id)가 남아 있기 때문에
         * reserved01은 다시 사용할 수 없다.
         */
        assertThat(
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                "reserved01"
                        )
        ).isEqualTo(
                1L
        );
    }

    /*
     * ========================================================
     * 2. loginId 조회 확인
     * ========================================================
     */
    @Test
    @DisplayName("loginId로 LOCAL 로그인 정보를 조회할 수 있다")
    void findByLoginId_returnsCredential() {

        // given

        User user =
                saveLocalUser(
                        "find-login-id@example.com",
                        "아이디 조회 사용자"
                );

        saveLocalCredential(
                user,
                "eunseo01",
                "$test$encoded$password"
        );

        /*
         * JPA 1차 캐시를 비워서
         * 아래 조회가 실제 MariaDB를 거치게 한다.
         */
        flushAndClear();


        // when

        UserLocalCredential result =
                userLocalCredentialRepository
                        .findByLoginId(
                                "eunseo01"
                        )
                        .orElseThrow();

        /*
         * 로그인 조회에서는 User까지 미리 로딩되어 있어야 한다.
         *
         * Service 트랜잭션이 끝난 이후 Controller에서
         * email/name 등의 User 정보를 사용하기 때문이다.
         */
        PersistenceUnitUtil persistenceUnitUtil =
                entityManager
                        .getEntityManagerFactory()
                        .getPersistenceUnitUtil();

        assertThat(
                persistenceUnitUtil.isLoaded(
                        result,
                        "user"
                )
        ).isTrue();


        // then

        assertThat(
                result.getLoginId()
        ).isEqualTo(
                "eunseo01"
        );

        assertThat(
                result.getPasswordHash()
        ).isEqualTo(
                "$test$encoded$password"
        );

        /*
         * 조회된 LOCAL Credential이
         * 우리가 만든 User와 연결되어 있는지 확인한다.
         */
        assertThat(
                result.getUser().getId()
        ).isEqualTo(
                user.getId()
        );

        /*
         * 최초 Credential 생성 시
         * passwordChangedAt도 자동으로 들어가야 한다.
         */
        assertThat(
                result.getPasswordChangedAt()
        ).isNotNull();
    }


    /*
     * ========================================================
     * 3. 아이디 존재 여부 확인
     * ========================================================
     *
     * 다음 단계의:
     *
     * "아이디 중복 확인 API"
     *
     * 에서 사용할 Repository 메서드를 검사한다.
     */
    @Test
    @DisplayName("loginId 존재 여부를 확인할 수 있다")
    void existsByLoginId_returnsCorrectResult() {

        // given

        User user =
                saveLocalUser(
                        "exists@example.com",
                        "아이디 중복 확인 사용자"
                );

        saveLocalCredential(
                user,
                "memory01",
                "$test$encoded$password"
        );

        flushAndClear();


        // when & then

        assertThat(
                userLocalCredentialRepository
                        .existsByLoginId(
                                "memory01"
                        )
        ).isTrue();

        assertThat(
                userLocalCredentialRepository
                        .existsByLoginId(
                                "not_used_id"
                        )
        ).isFalse();
    }


    /*
     * ========================================================
     * 4. User ID 조회 확인
     * ========================================================
     */
    @Test
    @DisplayName("User ID로 LOCAL 로그인 정보를 조회할 수 있다")
    void findByUserId_returnsCredential() {

        // given

        User user =
                saveLocalUser(
                        "find-user@example.com",
                        "User 조회 사용자"
                );

        saveLocalCredential(
                user,
                "memory02",
                "$test$encoded$password"
        );

        flushAndClear();


        // when

        UserLocalCredential result =
                userLocalCredentialRepository
                        .findByUser_Id(
                                user.getId()
                        )
                        .orElseThrow();


        // then

        assertThat(
                result.getUser().getId()
        ).isEqualTo(
                user.getId()
        );

        assertThat(
                result.getLoginId()
        ).isEqualTo(
                "memory02"
        );
    }


    /*
     * ========================================================
     * 5. 같은 loginId 중복 차단 확인
     * ========================================================
     *
     * V30의:
     *
     * UNIQUE(login_id)
     *
     * 제약조건을 실제 MariaDB에서 검사한다.
     */
    @Test
    @DisplayName("같은 loginId를 서로 다른 사용자가 사용할 수 없다")
    void duplicateLoginId_isRejected() {

        // given

        User firstUser =
                saveLocalUser(
                        "duplicate-one@example.com",
                        "첫 번째 사용자"
                );

        User secondUser =
                saveLocalUser(
                        "duplicate-two@example.com",
                        "두 번째 사용자"
                );


        /*
         * 첫 번째 사용자가 eunseo01을 먼저 사용한다.
         */
        saveLocalCredential(
                firstUser,
                "eunseo01",
                "$test$password$one"
        );

        flushAndClear();


        // when & then

        assertThatThrownBy(() -> {

            /*
             * 두 번째 사용자가 똑같은 eunseo01을
             * 만들려고 한다.
             */
            UserLocalCredential duplicate =
                    UserLocalCredential.builder()
                            .user(secondUser)
                            .loginId("eunseo01")
                            .passwordHash(
                                    "$test$password$two"
                            )
                            .build();

            entityManager.persist(
                    duplicate
            );

            /*
             * DB INSERT를 즉시 실행해서
             * UNIQUE 제약 위반을 바로 확인한다.
             */
            entityManager.flush();
        })
                .isInstanceOf(
                        PersistenceException.class
                );
    }


    /*
     * ========================================================
     * 6. 한 User당 LOCAL 계정 하나 제한 확인
     * ========================================================
     */
    @Test
    @DisplayName("한 사용자는 LOCAL 로그인 정보를 하나만 가질 수 있다")
    void sameUserCannotHaveTwoLocalCredentials() {

        // given

        User user =
                saveLocalUser(
                        "one-local@example.com",
                        "LOCAL 하나 사용자"
                );

        saveLocalCredential(
                user,
                "first_id",
                "$test$password$one"
        );

        flushAndClear();


        // when & then

        assertThatThrownBy(() -> {

            /*
             * 같은 User에게
             * 두 번째 LOCAL Credential을 만들려고 한다.
             *
             * user_id UNIQUE 때문에 실패해야 한다.
             */
            UserLocalCredential secondCredential =
                    UserLocalCredential.builder()
                            .user(user)
                            .loginId("second_id")
                            .passwordHash(
                                    "$test$password$two"
                            )
                            .build();

            entityManager.persist(
                    secondCredential
            );

            entityManager.flush();
        })
                .isInstanceOf(
                        PersistenceException.class
                );
    }


    /*
     * ========================================================
     * 테스트용 LOCAL User 생성 도우미
     * ========================================================
     *
     * OAuth 회원과 다르게:
     *
     * provider
     * providerId
     *
     * 를 넣지 않는 것이 핵심이다.
     */
    private User saveLocalUser(
            String email,
            String name
    ) {

        User user =
                User.builder()
                        .email(email)
                        .name(name)

                        /*
                         * LOCAL 회원이므로:
                         *
                         * .provider(...)
                         * .providerId(...)
                         *
                         * 를 넣지 않는다.
                         */
                        .build();

        /*
         * AbstractMariaDbRepositoryTest의 persist()는:
         *
         * entityManager.persist()
         * entityManager.flush()
         *
         * 까지 수행한다.
         */
        return persist(
                user
        );
    }


    /*
     * ========================================================
     * 테스트용 LOCAL Credential 생성 도우미
     * ========================================================
     */
    private UserLocalCredential saveLocalCredential(
            User user,
            String loginId,
            String passwordHash
    ) {

        UserLocalCredential credential =
                UserLocalCredential.builder()
                        .user(user)
                        .loginId(loginId)
                        .passwordHash(passwordHash)
                        .build();

        return persist(
                credential
        );
    }
}