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
import java.sql.Timestamp;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/*
 * UserOAuthAccountMigrationTest 역할
 *
 * V27 마이그레이션이 기존 users 테이블의 OAuth 정보를
 * 새로운 user_oauth_accounts 테이블로 정확하게 옮기는지 검증한다.
 *
 * 일반 Repository 테스트와 다른 점:
 *
 * 1. 빈 MariaDB를 준비한다.
 * 2. Flyway를 일부러 V26까지만 실행한다.
 * 3. "기존 서비스에서 이미 가입해 있던 사용자"를 직접 넣는다.
 * 4. V27을 추가로 실행한다.
 * 5. 기존 OAuth 정보가 새 테이블로 자동 복사됐는지 확인한다.
 *
 * 즉 실제 운영 배포 상황인
 *
 * 기존 DB(V26)
 *      ↓
 * 새 코드 배포
 *      ↓
 * V27 실행
 *      ↓
 * 기존 NAVER 계정 자동 이전
 *
 * 흐름을 그대로 재현하는 테스트다.
 */
@Testcontainers
class UserOAuthAccountMigrationTest {

    /*
     * 이번 테스트 전용 MariaDB다.
     *
     * 기존 Repository 테스트가 사용하는 DB와 분리해서
     * "V26까지만 적용된 DB"라는 상태를 정확하게 만들기 위해
     * 별도의 컨테이너를 사용한다.
     */
    @Container
    static final MariaDBContainer<?> mariaDBContainer =
            new MariaDBContainer<>(
                    DockerImageName.parse("mariadb:10.11")
            )
                    .withDatabaseName("migration_test")
                    .withUsername("test")
                    .withPassword("test");

    /*
     * 이번 테스트의 핵심이다.
     *
     * V26 상태에서 존재하던 기존 NAVER 사용자가
     * V27 실행 후 user_oauth_accounts로 자동 이전되는지 확인한다.
     *
     * 추가로:
     *
     * - provider가 소문자여도 NAVER로 정규화되는지
     * - 이미 탈퇴한 사용자는 이전하지 않는지
     *
     * 까지 함께 검증한다.
     */
    @Test
    @DisplayName("V27은 기존 활성 OAuth 사용자를 user_oauth_accounts로 backfill한다")
    void v27_backfillsExistingOAuthUsers() throws Exception {

        /*
         * =====================================================
         * 1단계
         * Flyway를 V26까지만 실행한다.
         * =====================================================
         *
         * 실제 운영 DB가 Google 로그인 기능을 배포하기 직전인
         * 기존 V26 상태라고 생각하면 된다.
         */
        migrateToVersion("26");

        /*
         * V26에는 아직 user_oauth_accounts 테이블이
         * 존재하지 않아야 한다.
         */
        assertThat(
                tableExists(
                        "user_oauth_accounts"
                )
        ).isFalse();

        /*
         * =====================================================
         * 2단계
         * 기존 서비스 사용자를 만든다.
         * =====================================================
         */

        /*
         * 현재 실제로 서비스를 이용 중인 사용자다.
         *
         * provider를 일부러 소문자 "naver"로 저장한다.
         *
         * V27의 UPPER(provider)가 제대로 동작하면
         * 새 테이블에는 "NAVER"로 들어가야 한다.
         */
        long activeUserId =
                insertExistingUser(
                        "active@example.com",
                        "기존 활성 사용자",
                        "2000",
                        "naver",
                        "naver-active-123",
                        null
                );

        /*
         * 이미 탈퇴한 사용자도 하나 만든다.
         *
         * V27에는:
         *
         * WHERE deleted_at IS NULL
         *
         * 조건이 있으므로 이 사용자의 OAuth 계정은
         * 새 테이블로 복사되면 안 된다.
         */
        long deletedUserId =
                insertExistingUser(
                        "deleted@example.com",
                        "탈퇴 사용자",
                        "1999",
                        "NAVER",
                        "naver-deleted-999",
                        LocalDateTime.of(
                                2026,
                                8,
                                1,
                                12,
                                0
                        )
                );

        /*
         * =====================================================
         * 3단계
         * 이제 V27까지 추가로 migration한다.
         * =====================================================
         */
        migrateToVersion("27");

        /*
         * V27이 실행됐으므로
         * 새로운 OAuth 계정 연결 테이블이 생겨야 한다.
         */
        assertThat(
                tableExists(
                        "user_oauth_accounts"
                )
        ).isTrue();

        /*
         * =====================================================
         * 4단계
         * 활성 사용자의 backfill 결과를 확인한다.
         * =====================================================
         */

        OAuthAccountRow activeOAuthAccount =
                findOAuthAccountByUserId(
                        activeUserId
                );

        /*
         * 기존 User와 같은 user_id로 연결됐는지 확인한다.
         */
        assertThat(
                activeOAuthAccount.userId()
        ).isEqualTo(
                activeUserId
        );

        /*
         * users에는 "naver"라고 들어있었지만
         * V27에서 UPPER(provider)를 사용했으므로
         * 새 테이블에는 NAVER로 저장되어야 한다.
         */
        assertThat(
                activeOAuthAccount.provider()
        ).isEqualTo(
                "NAVER"
        );

        /*
         * 기존 NAVER의 사용자 고유 ID가
         * 그대로 이전됐는지 확인한다.
         */
        assertThat(
                activeOAuthAccount.providerId()
        ).isEqualTo(
                "naver-active-123"
        );

        /*
         * =====================================================
         * 5단계
         * 탈퇴 사용자는 backfill하지 않았는지 확인한다.
         * =====================================================
         */

        assertThat(
                countOAuthAccountsByUserId(
                        deletedUserId
                )
        ).isZero();

        /*
         * 결과적으로 활성 기존 사용자 한 명만
         * user_oauth_accounts에 이전되어야 한다.
         */
        assertThat(
                countAllOAuthAccounts()
        ).isEqualTo(1L);

        /*
         * =====================================================
         * 6단계
         * Flyway가 실제로 V27까지 성공 처리했는지 확인한다.
         * =====================================================
         */
        assertThat(
                findCurrentFlywayVersion()
        ).isEqualTo(
                "27"
        );
    }

    /*
     * 지정한 Flyway 버전까지만 migration한다.
     *
     * 예:
     *
     * migrateToVersion("26")
     * → V1 ~ V26 실행
     *
     * 그 뒤
     *
     * migrateToVersion("27")
     * → 이미 실행된 V1 ~ V26은 건너뛰고
     *   새로 남아 있는 V27만 실행
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

                        /*
                         * 실제 프로젝트에서 사용하는
                         * Flyway SQL 파일 위치다.
                         */
                        .locations(
                                "classpath:db/migration"
                        )

                        /*
                         * 이번 호출에서는 어디까지 migration할지 정한다.
                         */
                        .target(
                                MigrationVersion.fromVersion(
                                        version
                                )
                        )
                        .load();

        // 실제 migration 실행
        flyway.migrate();
    }

    /*
     * V26 상태의 기존 사용자를 직접 users 테이블에 넣는다.
     *
     * JPA Entity를 사용하지 않는 이유:
     *
     * 이 테스트는 "현재 Java 코드"를 테스트하는 것이 아니라
     * "예전 DB 상태 → 새 DB 상태"의 migration 자체를 테스트하기 때문이다.
     *
     * 그래서 JDBC를 이용해 DB에 직접 INSERT한다.
     */
    private long insertExistingUser(
            String email,
            String name,
            String birthyear,
            String provider,
            String providerId,
            LocalDateTime deletedAt
    ) throws Exception {

        String sql = """
                INSERT INTO users (
                    email,
                    name,
                    birthyear,
                    provider,
                    provider_id,
                    created_at,
                    updated_at,
                    deleted_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """;

        /*
         * 기존 사용자의 가입/수정 시간이라고 가정할 값이다.
         *
         * V27이 이 값을 새 OAuth 테이블의
         * created_at / updated_at으로 이어받는다.
         */
        LocalDateTime existingCreatedAt =
                LocalDateTime.of(
                        2026,
                        1,
                        10,
                        10,
                        30
                );

        LocalDateTime existingUpdatedAt =
                LocalDateTime.of(
                        2026,
                        7,
                        20,
                        15,
                        45
                );

        try (
                Connection connection =
                        mariaDBContainer.createConnection("");

                PreparedStatement statement =
                        connection.prepareStatement(
                                sql,
                                PreparedStatement.RETURN_GENERATED_KEYS
                        )
        ) {

            // email
            statement.setString(
                    1,
                    email
            );

            // name
            statement.setString(
                    2,
                    name
            );

            // birthyear
            statement.setString(
                    3,
                    birthyear
            );

            // provider
            statement.setString(
                    4,
                    provider
            );

            // provider_id
            statement.setString(
                    5,
                    providerId
            );

            // created_at
            statement.setTimestamp(
                    6,
                    Timestamp.valueOf(
                            existingCreatedAt
                    )
            );

            // updated_at
            statement.setTimestamp(
                    7,
                    Timestamp.valueOf(
                            existingUpdatedAt
                    )
            );

            // deleted_at
            if (deletedAt == null) {

                statement.setTimestamp(
                        8,
                        null
                );

            } else {

                statement.setTimestamp(
                        8,
                        Timestamp.valueOf(
                                deletedAt
                        )
                );
            }

            // 실제 INSERT 실행
            statement.executeUpdate();

            /*
             * AUTO_INCREMENT로 생성된 user ID를 가져온다.
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
     * V27 실행 후 특정 user_id에 연결된
     * OAuth 계정을 조회한다.
     */
    private OAuthAccountRow findOAuthAccountByUserId(
            long userId
    ) throws Exception {

        String sql = """
                SELECT
                    user_id,
                    provider,
                    provider_id
                FROM user_oauth_accounts
                WHERE user_id = ?
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

            try (
                    ResultSet resultSet =
                            statement.executeQuery()
            ) {

                /*
                 * 활성 기존 사용자는 반드시
                 * OAuth 연결 하나를 가져야 한다.
                 */
                assertThat(
                        resultSet.next()
                ).isTrue();

                OAuthAccountRow result =
                        new OAuthAccountRow(
                                resultSet.getLong(
                                        "user_id"
                                ),
                                resultSet.getString(
                                        "provider"
                                ),
                                resultSet.getString(
                                        "provider_id"
                                )
                        );

                /*
                 * user_id + provider UNIQUE 때문에
                 * 이 테스트 상황에서는 추가 row가 없어야 한다.
                 */
                assertThat(
                        resultSet.next()
                ).isFalse();

                return result;
            }
        }
    }

    /*
     * 특정 사용자에게 연결된 OAuth 계정이
     * 몇 개인지 조회한다.
     *
     * 탈퇴 사용자 backfill 제외 여부를 확인할 때 사용한다.
     */
    private long countOAuthAccountsByUserId(
            long userId
    ) throws Exception {

        String sql = """
                SELECT COUNT(*)
                FROM user_oauth_accounts
                WHERE user_id = ?
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

            try (
                    ResultSet resultSet =
                            statement.executeQuery()
            ) {

                resultSet.next();

                return resultSet.getLong(1);
            }
        }
    }

    /*
     * user_oauth_accounts 전체 row 개수를 조회한다.
     */
    private long countAllOAuthAccounts()
            throws Exception {

        String sql = """
                SELECT COUNT(*)
                FROM user_oauth_accounts
                """;

        try (
                Connection connection =
                        mariaDBContainer.createConnection("");

                PreparedStatement statement =
                        connection.prepareStatement(sql);

                ResultSet resultSet =
                        statement.executeQuery()
        ) {

            resultSet.next();

            return resultSet.getLong(1);
        }
    }

    /*
     * 특정 테이블이 현재 DB에 존재하는지 확인한다.
     *
     * information_schema는
     * MariaDB가 가지고 있는 "DB 구조 설명서"라고 생각하면 된다.
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

                resultSet.next();

                return resultSet.getLong(1) == 1L;
            }
        }
    }

    /*
     * Flyway의 schema history 테이블에서
     * 현재 가장 마지막으로 성공한 migration 버전을 조회한다.
     *
     * 테스트 마지막에 실제로 V27까지 적용됐는지 확인한다.
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

    /*
     * DB에서 읽어온 OAuth 연결 결과를
     * 테스트에서 편하게 다루기 위한 작은 객체다.
     */
    private record OAuthAccountRow(
            long userId,
            String provider,
            String providerId
    ) {
    }
}