package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** V36에서 V37로 올린 실제 MariaDB에서 기존 후보 보존·새 오류 저장·상태 제약을 검증한다. */
@Testcontainers
class AiGenerationFailureV37MigrationTest {
    @Container
    static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("ai_failure_test").withUsername("test").withPassword("test");

    @Test
    void upgradePreservesHistoryAndAcceptsOnlyValidFailureStates() throws Exception {
        migrate("36");
        execute("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'failure-test@example.com','테스트','2000','NAVER','failure-test')");
        execute("INSERT INTO jar_design_drafts (draft_id,owner_id,original_s3_key,expires_at) VALUES (1,1,'original.png',DATE_ADD(NOW(6), INTERVAL 1 DAY))");
        execute("""
                INSERT INTO jar_ai_generations (generation_id,draft_id,ai_style,status,ai_provider,ai_model,
                    prompt_version,error_code,error_message,completed_at)
                VALUES (1,1,'CUTE_2D','FAILED','CLOUDFLARE','test-model','BASE_V2+CUTE_2D_V2',
                    'PROVIDER_REQUEST_FAILED','기존 실패',NOW(6))
                """);
        execute("""
                INSERT INTO jar_ai_generations (generation_id,draft_id,ai_style,status,ai_provider,ai_model,
                    prompt_version,generated_s3_key,completed_at)
                VALUES (2,1,'CUTE_2D','SUCCEEDED','CLOUDFLARE','test-model','BASE_V2+CUTE_2D_V2','legacy.png',NOW(6))
                """);
        execute("""
                INSERT INTO jar_ai_generations (generation_id,draft_id,ai_style,ai_provider,ai_model,prompt_version)
                VALUES (3,1,'CUTE_2D','CLOUDFLARE','test-model','BASE_V2+CUTE_2D_V2')
                """);
        assertThatThrownBy(() -> execute("UPDATE jar_ai_generations SET status='FAILED',error_code='PROVIDER_CONTENT_POLICY_REJECTED',completed_at=NOW(6) WHERE generation_id=3"))
                .isInstanceOf(SQLException.class);

        migrate("37");
        try (var connection = database.createConnection(""); var sql = connection.createStatement();
             var rows = sql.executeQuery("SELECT status,error_code,error_message,generated_s3_key FROM jar_ai_generations ORDER BY generation_id")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString("error_code")).isEqualTo("PROVIDER_REQUEST_FAILED");
            assertThat(rows.getString("error_message")).isEqualTo("기존 실패");
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString("status")).isEqualTo("SUCCEEDED");
            assertThat(rows.getString("generated_s3_key")).isEqualTo("legacy.png");
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString("status")).isEqualTo("PROCESSING");
            assertThat(rows.getString("error_code")).isNull();
        }
        // 새 코드뿐 아니라 기존 오류와 대기열 포화도 실제 FAILED 저장을 통과해야 한다.
        for (JarAiGenerationErrorCode code : JarAiGenerationErrorCode.values()) {
            try (var connection = database.createConnection(""); var sql = connection.prepareStatement("""
                    INSERT INTO jar_ai_generations (draft_id,ai_style,status,ai_provider,ai_model,
                        prompt_version,error_code,completed_at)
                    VALUES (1,'CUTE_2D','FAILED','CLOUDFLARE','test-model','BASE_V2+CUTE_2D_V2',?,NOW(6))
                    """)) {
                sql.setString(1, code.name());
                assertThat(sql.executeUpdate()).isEqualTo(1);
            }
        }
        assertRejected("UPDATE jar_ai_generations SET status='FAILED',error_code='UNRECOGNIZED_FAILURE',completed_at=NOW(6) WHERE generation_id=3");
        assertRejected("UPDATE jar_ai_generations SET error_code='INTERNAL_ERROR' WHERE generation_id=3");
        assertRejected("UPDATE jar_ai_generations SET status='SUCCEEDED',completed_at=NOW(6) WHERE generation_id=3");
        assertRejected("UPDATE jar_ai_generations SET generated_s3_key='invalid.png' WHERE generation_id=1");
        assertRejected("UPDATE jar_ai_generations SET error_code='INTERNAL_ERROR' WHERE generation_id=2");
    }

    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }

    private void execute(String statement) throws SQLException {
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            sql.executeUpdate(statement);
        }
    }

    private void assertRejected(String statement) {
        assertThatThrownBy(() -> execute(statement)).isInstanceOf(SQLException.class);
    }
}
