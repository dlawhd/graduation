package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/*
 * KakaoOAuthProviderMigrationTest 역할
 *
 * V29 마이그레이션이 실제 MariaDB의
 * user_oauth_accounts.provider CHECK 제약을
 * 올바르게 변경하는지 검증하는 테스트다.
 *
 * 우리가 확인하려는 흐름:
 *
 * V28 상태
 * ├─ NAVER  저장 가능
 * ├─ GOOGLE 저장 가능
 * └─ KAKAO  저장 불가
 *
 *          ↓
 *
 * V29 실행
 *
 *          ↓
 *
 * V29 상태
 * ├─ NAVER  저장 가능
 * ├─ GOOGLE 저장 가능
 * └─ KAKAO  저장 가능
 *
 * Repository/JPA를 사용하지 않고 JDBC로 직접 INSERT하는 이유:
 *
 * 이 테스트의 목적은 Java Entity가 아니라
 * Flyway SQL과 MariaDB CHECK 제약 자체를 검사하는 것이기 때문이다.
 */
@Testcontainers
class KakaoOAuthProviderMigrationTest {

    /*
     * V29 테스트만을 위한 별도의 MariaDB다.
     *
     * 기존 UserOAuthAccountMigrationTest와 컨테이너를 분리해서
     * V27 migration 테스트의 DB 상태가
     * 이번 테스트에 영향을 주지 않도록 한다.
     */
    @Container
    static final MariaDBContainer<?> mariaDBContainer =
            new MariaDBContainer<>(
                    DockerImageName.parse("mariadb:10.11")
            )
                    .withDatabaseName("kakao_v29_migration_test")
                    .withUsername("test")
                    .withPassword("test");

    /*
     * V28에서는 KAKAO가 거부되고,
     * V29 이후에는 KAKAO가 정상적으로 저장되는지 확인한다.
     *
     * 즉 V29가 실제로 필요한 이유와
     * V29 적용 결과를 한 테스트에서 함께 검증한다.
     */
    @Test
    @DisplayName("V29 적용 전에는 KAKAO가 거부되고 적용 후에는 저장할 수 있다")
    void v29_allowsKakaoOAuthProvider() throws Exception {

        /*
         * =====================================================
         * 1단계
         * Flyway를 일부러 V28까지만 실행한다.
         * =====================================================
         *
         * 이 상태의 user_oauth_accounts CHECK 제약은
         *
         * NAVER
         * GOOGLE
         *
         * 두 값만 허용한다.
         */
        migrateToVersion("28");

        assertThat(
                findCurrentFlywayVersion()
        ).isEqualTo(
                "28"
        );


        /*
         * =====================================================
         * 2단계
         * 테스트용 Memory Jar User를 한 명 만든다.
         * =====================================================
         *
         * OAuthAccount는 반드시 실제 users row와 연결되어야 하므로
         * 먼저 사용자 한 명을 저장한다.
         */
        long userId =
                insertTestUser();


        /*
         * =====================================================
         * 3단계
         * V28 상태에서 KAKAO 저장을 시도한다.
         * =====================================================
         *
         * 아직 V29가 실행되지 않았으므로
         *
         * CHECK (
         *     provider IN (
         *         'NAVER',
         *         'GOOGLE'
         *     )
         * )
         *
         * 제약 때문에 KAKAO INSERT가 실패해야 한다.
         */
        assertThatThrownBy(() ->
                insertOAuthAccount(
                        userId,
                        "KAKAO",
                        "kakao-user-123"
                )
        )
                .isInstanceOf(
                        SQLException.class
                );

        /*
         * 실패한 INSERT가 실제 DB에 남지 않았는지도 확인한다.
         */
        assertThat(
                countOAuthAccounts(
                        userId,
                        "KAKAO",
                        "kakao-user-123"
                )
        ).isZero();


        /*
         * =====================================================
         * 4단계
         * 이제 V29를 실행한다.
         * =====================================================
         *
         * 이미 적용된 V1 ~ V28은 건너뛰고
         * V29만 새롭게 실행된다.
         */
        migrateToVersion("29");

        assertThat(
                findCurrentFlywayVersion()
        ).isEqualTo(
                "29"
        );


        /*
         * =====================================================
         * 5단계
         * 같은 KAKAO 계정을 다시 저장한다.
         * =====================================================
         *
         * V29에서는 CHECK 제약이:
         *
         * NAVER
         * GOOGLE
         * KAKAO
         *
         * 세 값을 허용하므로 이번에는 성공해야 한다.
         */
        insertOAuthAccount(
                userId,
                "KAKAO",
                "kakao-user-123"
        );


        /*
         * =====================================================
         * 6단계
         * 실제 MariaDB에 KAKAO row가 들어갔는지 확인한다.
         * =====================================================
         */
        assertThat(
                countOAuthAccounts(
                        userId,
                        "KAKAO",
                        "kakao-user-123"
                )
        ).isEqualTo(
                1L
        );
    }

    /*
     * 지정한 Flyway 버전까지만 migration한다.
     *
     * 예:
     *
     * migrateToVersion("28")
     * → V1 ~ V28 적용
     *
     * migrateToVersion("29")
     * → 이미 끝난 V1 ~ V28은 건너뛰고 V29만 적용
     */
    private void migrateToVersion(
            String version
    ) {

        Flyway flyway =
                Flyway.configure()
                        .dataSource(
                                mariaDBContainer.getJdbcUrl(),
                                mariaDBContainer.getUsername(),
                                mariaDBContainer.getPassword()
                        )

                        // 실제 프로젝트 Flyway SQL 파일 위치
                        .locations(
                                "classpath:db/migration"
                        )

                        // 이번 호출에서 적용할 마지막 버전
                        .target(
                                MigrationVersion.fromVersion(
                                        version
                                )
                        )
                        .load();

        // 실제 MariaDB에 migration 실행
        flyway.migrate();
    }

    /*
     * OAuthAccount를 연결할 테스트 User를 만든다.
     *
     * users.provider / provider_id는
     * 기존 코드와 호환성을 위해 아직 남아 있으므로
     * 테스트 User도 기존 형식에 맞춰 NAVER로 생성한다.
     */
    private long insertTestUser()
            throws Exception {

        String sql = """
                INSERT INTO users (
                    email,
                    name,
                    birthyear,
                    provider,
                    provider_id
                )
                VALUES (?, ?, ?, ?, ?)
                """;

        try (
                Connection connection =
                        mariaDBContainer.createConnection("");

                PreparedStatement statement =
                        connection.prepareStatement(
                                sql,
                                PreparedStatement.RETURN_GENERATED_KEYS
                        )
        ) {

            statement.setString(
                    1,
                    "kakao-v29@example.com"
            );

            statement.setString(
                    2,
                    "카카오 V29 테스트"
            );

            statement.setString(
                    3,
                    "2000"
            );

            statement.setString(
                    4,
                    "NAVER"
            );

            statement.setString(
                    5,
                    "legacy-naver-v29-user"
            );

            statement.executeUpdate();

            /*
             * AUTO_INCREMENT로 생성된 users.id를 가져온다.
             */
            try (
                    ResultSet generatedKeys =
                            statement.getGeneratedKeys()
            ) {

                assertThat(
                        generatedKeys.next()
                ).isTrue();

                return generatedKeys.getLong(1);
            }
        }
    }

    /*
     * user_oauth_accounts에 OAuth 연결을 직접 저장한다.
     *
     * JPA를 거치지 않기 때문에
     * MariaDB의 CHECK 제약 결과를 직접 확인할 수 있다.
     */
    private void insertOAuthAccount(
            long userId,
            String provider,
            String providerId
    ) throws Exception {

        String sql = """
                INSERT INTO user_oauth_accounts (
                    user_id,
                    provider,
                    provider_id
                )
                VALUES (?, ?, ?)
                """;

        try (
                Connection connection =
                        mariaDBContainer.createConnection("");

                PreparedStatement statement =
                        connection.prepareStatement(sql)
        ) {

            statement.setLong(
                    1,
                    userId
            );

            statement.setString(
                    2,
                    provider
            );

            statement.setString(
                    3,
                    providerId
            );

            // 여기에서 실제 MariaDB CHECK 제약이 검사된다.
            statement.executeUpdate();
        }
    }

    /*
     * 특정 OAuth 계정이 실제 DB에 몇 개 저장되어 있는지 확인한다.
     */
    private long countOAuthAccounts(
            long userId,
            String provider,
            String providerId
    ) throws Exception {

        String sql = """
                SELECT COUNT(*)
                FROM user_oauth_accounts
                WHERE user_id = ?
                  AND provider = ?
                  AND provider_id = ?
                """;

        try (
                Connection connection =
                        mariaDBContainer.createConnection("");

                PreparedStatement statement =
                        connection.prepareStatement(sql)
        ) {

            statement.setLong(
                    1,
                    userId
            );

            statement.setString(
                    2,
                    provider
            );

            statement.setString(
                    3,
                    providerId
            );

            try (
                    ResultSet resultSet =
                            statement.executeQuery()
            ) {

                assertThat(
                        resultSet.next()
                ).isTrue();

                return resultSet.getLong(1);
            }
        }
    }

    /*
     * Flyway history에서
     * 현재 마지막으로 성공한 Migration 버전을 확인한다.
     */
    private String findCurrentFlywayVersion()
            throws Exception {

        String sql = """
                SELECT version
                FROM flyway_schema_history
                WHERE success = 1
                  AND version IS NOT NULL
                ORDER BY installed_rank DESC
                LIMIT 1
                """;

        try (
                Connection connection =
                        mariaDBContainer.createConnection("");

                PreparedStatement statement =
                        connection.prepareStatement(sql);

                ResultSet resultSet =
                        statement.executeQuery()
        ) {

            assertThat(
                    resultSet.next()
            ).isTrue();

            return resultSet.getString(
                    "version"
            );
        }
    }
}