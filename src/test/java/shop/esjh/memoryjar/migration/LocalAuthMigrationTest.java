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
 * LocalAuthMigrationTest 역할
 *
 * V30 마이그레이션이 Memory Jar 자체 로그인을 위한
 * DB 구조를 정확하게 만드는지 실제 MariaDB 10.11에서 검증한다.
 *
 * 이번 테스트에서 확인하는 것:
 *
 * 1. V29까지는 users.provider / provider_id가 NOT NULL인가?
 * 2. V30 이후 NULL을 허용하는가?
 * 3. user_local_credentials가 생성되는가?
 * 4. email_verifications가 생성되는가?
 * 5. login_id 중복을 DB가 막는가?
 * 6. 한 User가 LOCAL 계정을 두 개 만들 수 없도록 막는가?
 * 7. 이메일 + 인증 목적 중복을 막는가?
 * 8. Flyway가 최종적으로 V30까지 적용되는가?
 */
@Testcontainers
class LocalAuthMigrationTest {

    /*
     * 실제 운영 환경과 같은 MariaDB 10.11을 사용한다.
     *
     * H2가 아니라 MariaDB에서 검사하는 이유는
     * CHECK, REGEXP, UNIQUE 같은 DB 규칙이
     * 실제 운영 DB에서도 정말 동작하는지 보기 위해서다.
     */
    @Container
    static final MariaDBContainer<?> mariaDBContainer =
            new MariaDBContainer<>(
                    DockerImageName.parse("mariadb:10.11")
            )
                    .withDatabaseName("local_auth_migration_test")
                    .withUsername("test")
                    .withPassword("test");

    @Test
    @DisplayName("V30은 LOCAL 로그인과 이메일 인증을 위한 DB 구조를 생성한다")
    void v30CreatesLocalAuthSchema() throws Exception {

        /*
         * =====================================================
         * 1. 먼저 V29 상태를 만든다.
         * =====================================================
         */
        migrateToVersion("29");

        /*
         * V29에는 아직 LOCAL 로그인 관련 테이블이 없어야 한다.
         */
        assertThat(
                tableExists("user_local_credentials")
        ).isFalse();

        assertThat(
                tableExists("email_verifications")
        ).isFalse();

        /*
         * V29에서는 users.provider가 NOT NULL이다.
         */
        assertThat(
                isColumnNullable(
                        "users",
                        "provider"
                )
        ).isFalse();

        /*
         * V29에서는 users.provider_id도 NOT NULL이다.
         */
        assertThat(
                isColumnNullable(
                        "users",
                        "provider_id"
                )
        ).isFalse();


        /*
         * =====================================================
         * 2. V30을 적용한다.
         * =====================================================
         */
        migrateToVersion("30");


        /*
         * =====================================================
         * 3. 새 테이블 생성 확인
         * =====================================================
         */
        assertThat(
                tableExists("user_local_credentials")
        ).isTrue();

        assertThat(
                tableExists("email_verifications")
        ).isTrue();


        /*
         * =====================================================
         * 4. LOCAL User를 만들 수 있는지 확인
         * =====================================================
         *
         * LOCAL 회원은 OAuth Provider가 없으므로
         *
         * provider = NULL
         * provider_id = NULL
         *
         * 을 허용해야 한다.
         */
        assertThat(
                isColumnNullable(
                        "users",
                        "provider"
                )
        ).isTrue();

        assertThat(
                isColumnNullable(
                        "users",
                        "provider_id"
                )
        ).isTrue();

        long firstUserId =
                insertLocalUser(
                        "local-one@example.com",
                        "LOCAL 사용자 1"
                );

        long secondUserId =
                insertLocalUser(
                        "local-two@example.com",
                        "LOCAL 사용자 2"
                );


        /*
         * =====================================================
         * 5. 정상 LOCAL Credential 저장
         * =====================================================
         */
        insertLocalCredential(
                firstUserId,
                "eunseo01"
        );


        /*
         * =====================================================
         * 6. login_id 중복 방지 확인
         * =====================================================
         *
         * 다른 User라도 같은 login_id를 사용할 수 없다.
         */
        assertThatThrownBy(
                () -> insertLocalCredential(
                        secondUserId,
                        "eunseo01"
                )
        )
                .isInstanceOf(SQLException.class);


        /*
         * =====================================================
         * 7. User당 LOCAL Credential 하나만 허용되는지 확인
         * =====================================================
         *
         * firstUserId는 이미 eunseo01이라는
         * LOCAL 로그인 정보를 가지고 있다.
         *
         * 따라서 같은 User에게 다른 LOCAL 아이디를
         * 한 번 더 추가하면 DB가 막아야 한다.
         */
        assertThatThrownBy(
                () -> insertLocalCredential(
                        firstUserId,
                        "eunseo02"
                )
        )
                .isInstanceOf(SQLException.class);


        /*
         * =====================================================
         * 8. 잘못된 login_id 형식 차단 확인
         * =====================================================
         *
         * 우리가 정한 규칙:
         *
         * 4~20자
         * 영문 소문자
         * 숫자
         * _
         */
        assertThatThrownBy(
                () -> insertLocalCredential(
                        secondUserId,
                        "ABC!"
                )
        )
                .isInstanceOf(SQLException.class);


        /*
         * =====================================================
         * 9. 이메일 인증 정보 정상 저장
         * =====================================================
         */
        insertEmailVerification(
                "verify@example.com",
                "SIGNUP"
        );


        /*
         * =====================================================
         * 10. 같은 이메일 + 같은 목적 중복 방지
         * =====================================================
         *
         * 재전송할 때는 INSERT를 반복하는 게 아니라
         * 기존 row의 인증번호와 시간을 UPDATE할 예정이다.
         */
        assertThatThrownBy(
                () -> insertEmailVerification(
                        "verify@example.com",
                        "SIGNUP"
                )
        )
                .isInstanceOf(SQLException.class);


        /*
         * =====================================================
         * 11. 같은 이메일이어도 목적이 다르면 허용
         * =====================================================
         *
         * 회원가입 인증과 비밀번호 재설정 인증은
         * 서로 다른 흐름이기 때문이다.
         */
        insertEmailVerification(
                "verify@example.com",
                "PASSWORD_RESET"
        );


        /*
         * =====================================================
         * 12. 잘못된 이메일 인증 목적 차단
         * =====================================================
         */
        assertThatThrownBy(
                () -> insertEmailVerification(
                        "wrong-purpose@example.com",
                        "UNKNOWN"
                )
        )
                .isInstanceOf(SQLException.class);


        /*
         * =====================================================
         * 13. Flyway 최종 버전 확인
         * =====================================================
         */
        assertThat(
                findCurrentFlywayVersion()
        ).isEqualTo("30");
    }

    /*
     * 원하는 Flyway 버전까지만 적용한다.
     *
     * migrateToVersion("29")
     * → V1 ~ V29
     *
     * migrateToVersion("30")
     * → 새로 남아 있는 V30 적용
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
                        .locations(
                                "classpath:db/migration"
                        )
                        .target(
                                MigrationVersion.fromVersion(version)
                        )
                        .load();

        flyway.migrate();
    }

    /*
     * 특정 테이블이 실제 DB에 존재하는지 확인한다.
     */
    private boolean tableExists(
            String tableName
    ) throws Exception {

        String sql = """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name = ?
                """;

        try (
                Connection connection =
                        mariaDBContainer.createConnection("");

                PreparedStatement statement =
                        connection.prepareStatement(sql)
        ) {

            statement.setString(
                    1,
                    tableName
            );

            try (
                    ResultSet resultSet =
                            statement.executeQuery()
            ) {

                assertThat(
                        resultSet.next()
                ).isTrue();

                return resultSet.getInt(1) > 0;
            }
        }
    }

    /*
     * 특정 컬럼이 NULL을 허용하는지 확인한다.
     *
     * information_schema.columns의 IS_NULLABLE은
     *
     * YES
     * NO
     *
     * 문자열로 결과를 돌려준다.
     */
    private boolean isColumnNullable(
            String tableName,
            String columnName
    ) throws Exception {

        String sql = """
                SELECT IS_NULLABLE
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = ?
                  AND column_name = ?
                """;

        try (
                Connection connection =
                        mariaDBContainer.createConnection("");

                PreparedStatement statement =
                        connection.prepareStatement(sql)
        ) {

            statement.setString(
                    1,
                    tableName
            );

            statement.setString(
                    2,
                    columnName
            );

            try (
                    ResultSet resultSet =
                            statement.executeQuery()
            ) {

                assertThat(
                        resultSet.next()
                ).isTrue();

                return "YES".equalsIgnoreCase(
                        resultSet.getString(
                                "IS_NULLABLE"
                        )
                );
            }
        }
    }

    /*
     * OAuth 정보가 없는 LOCAL User를 직접 만든다.
     *
     * 여기서 중요한 부분:
     *
     * provider
     * provider_id
     *
     * 를 INSERT 문에 넣지 않는다.
     *
     * V30이 제대로 적용됐다면
     * 두 컬럼에는 자동으로 NULL이 들어가고
     * INSERT가 성공해야 한다.
     */
    private long insertLocalUser(
            String email,
            String name
    ) throws Exception {

        String sql = """
                INSERT INTO users (
                    email,
                    name
                )
                VALUES (?, ?)
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
                    email
            );

            statement.setString(
                    2,
                    name
            );

            statement.executeUpdate();

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
     * LOCAL 로그인 정보를 직접 저장한다.
     *
     * password_hash는 테스트용 가짜 Hash다.
     *
     * 이 테스트의 목적은 실제 비밀번호 암호화가 아니라
     * V30 DB 제약조건이 제대로 동작하는지 확인하는 것이다.
     */
    private void insertLocalCredential(
            long userId,
            String loginId
    ) throws Exception {

        String sql = """
                INSERT INTO user_local_credentials (
                    user_id,
                    login_id,
                    password_hash
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
                    loginId
            );

            statement.setString(
                    3,
                    "$test$password$hash$for$migration"
            );

            statement.executeUpdate();
        }
    }

    /*
     * 이메일 인증 row를 직접 저장한다.
     *
     * code_hash는 실제 인증번호가 아니라
     * 테스트용 64자리 Hash 값이다.
     */
    private void insertEmailVerification(
            String email,
            String purpose
    ) throws Exception {

        String sql = """
                INSERT INTO email_verifications (
                    email,
                    purpose,
                    code_hash,
                    code_expires_at
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    DATE_ADD(NOW(6), INTERVAL 5 MINUTE)
                )
                """;

        try (
                Connection connection =
                        mariaDBContainer.createConnection("");

                PreparedStatement statement =
                        connection.prepareStatement(sql)
        ) {

            statement.setString(
                    1,
                    email
            );

            statement.setString(
                    2,
                    purpose
            );

            statement.setString(
                    3,
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                            + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            );

            statement.executeUpdate();
        }
    }

    /*
     * 현재 DB에 적용된 가장 최신 Flyway 버전을 확인한다.
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