package shop.esjh.memoryjar.migration;

import java.sql.SQLException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 실제 MariaDB에서 V47 이력을 보존하고 V48 예약 키·삭제 완료 기록 및 기존 상태 제약을 검증한다. */
@Testcontainers
class AiCandidateCleanupV48MigrationTest {
    @Container
    static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("ai_cleanup_test").withUsername("test").withPassword("test");

    @Test
    void upgradeKeepsLegacyHistoryAndMakesFailedUploadReservationRetryable() throws Exception {
        migrate("47");
        execute("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'cleanup@example.com','시험','2000','NAVER','cleanup')");
        execute("INSERT INTO jar_design_drafts (draft_id,owner_id,original_s3_key,expires_at) VALUES (1,1,'fixture/original',DATE_ADD(NOW(6), INTERVAL 1 DAY))");
        execute("""
                INSERT INTO jar_ai_generations (generation_id,draft_id,ai_style,status,ai_provider,ai_model,
                    prompt_version,error_code,completed_at)
                VALUES (1,1,'CUTE_2D','FAILED','CLOUDFLARE','fixture-model','fixture-v1','INTERNAL_ERROR',NOW(6))
                """);
        migrate("48");
        try (var connection = database.createConnection(""); var sql = connection.createStatement();
             var row = sql.executeQuery("SELECT generated_s3_key,candidate_upload_s3_key,candidate_cleanup_at,status FROM jar_ai_generations WHERE generation_id=1")) {
            assertThat(row.next()).isTrue();
            assertThat(row.getString("status")).isEqualTo("FAILED");
            assertThat(row.getString("generated_s3_key")).isNull();
            assertThat(row.getString("candidate_upload_s3_key")).isNull();
            assertThat(row.getTimestamp("candidate_cleanup_at")).isNull();
        }
        execute("UPDATE jar_ai_generations SET candidate_upload_s3_key='fixture/failed' WHERE generation_id=1");
        execute("UPDATE jar_ai_generations SET candidate_cleanup_at=NOW(6) WHERE generation_id=1");
        // 새 컬럼은 FAILED의 기존 generated_s3_key=NULL 제약을 완화하지 않는다.
        assertThatThrownBy(() -> execute("UPDATE jar_ai_generations SET generated_s3_key='invalid' WHERE generation_id=1"))
                .isInstanceOf(SQLException.class);
        try (var connection = database.createConnection(""); var indexes = connection.getMetaData()
                .getIndexInfo(database.getDatabaseName(), null, "jar_ai_generations", false, false)) {
            boolean found = false;
            while (indexes.next()) found |= "idx_ai_failed_candidate_cleanup".equals(indexes.getString("INDEX_NAME"));
            assertThat(found).isTrue();
        }
    }

    private void migrate(String target) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(target).load().migrate();
    }

    private void execute(String query) throws SQLException {
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            sql.executeUpdate(query);
        }
    }
}
