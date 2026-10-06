package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.sql.DriverManager;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 운영과 같은 MariaDB 10.11에서 비교 도구의 SELECT, 배치 fallback, 사전 중단 조건을 검증한다. */
@Testcontainers
class AiPromptComparisonDatabaseTest {
    @Container static final MariaDBContainer<?> DATABASE = new MariaDBContainer<>("mariadb:10.11");

    /** 조회에 쓰는 실제 컬럼 계약만 가진 임시 스키마다. 운영 DB/Flyway에는 접근하지 않는다. */
    @BeforeEach
    void schema() throws Exception {
        execute("DROP TABLE IF EXISTS jar_ai_generations");
        execute("DROP TABLE IF EXISTS jar_design_drafts");
        execute("""
                CREATE TABLE jar_design_drafts (
                  draft_id BIGINT PRIMARY KEY, owner_id BIGINT, original_s3_key VARCHAR(512), body_style VARCHAR(30),
                  selected_design_type VARCHAR(20), status VARCHAR(20), original_s3_deleted_at DATETIME(6),
                  expires_at DATETIME(6), updated_at DATETIME(6),
                  ai_input_x DECIMAL(7,6), ai_input_y DECIMAL(7,6), ai_input_width DECIMAL(7,6),
                  ai_input_height DECIMAL(7,6), ai_input_fit VARCHAR(10),
                  photo_x DECIMAL(7,6), photo_y DECIMAL(7,6), photo_width DECIMAL(7,6),
                  photo_height DECIMAL(7,6), photo_fit VARCHAR(10))
                """);
        execute("CREATE TABLE jar_ai_generations (generation_id BIGINT PRIMARY KEY, draft_id BIGINT, ai_style VARCHAR(30), status VARCHAR(20))");
        execute("INSERT INTO jar_ai_generations VALUES (131,44,'CUTE_2D','FAILED'), (134,44,'HAND_DRAWN','FAILED')");
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
             var insert = connection.prepareStatement("""
                     INSERT INTO jar_design_drafts VALUES (44,7,'test-only-original.png','STAR','ORIGINAL','ACTIVE',NULL,?,
                     '2026-10-06 19:00:00',0.1,0.2,0.4,0.5,'COVER',0,0,1,1,'COVER')
                     """)) {
            insert.setObject(1, LocalDateTime.now(ZoneId.of("Asia/Seoul")).plusDays(1));
            insert.executeUpdate();
        }
    }

    @Test
    void savedInputFrameIsReadWithoutChangingDraftOrGenerations() throws Exception {
        var first = AiPromptComparisonTool.readDraft(env());
        var second = AiPromptComparisonTool.readDraft(env());
        assertThat(first).isEqualTo(second);
        assertThat(first.frame().x()).isEqualByComparingTo(new BigDecimal("0.1"));
        assertThat(first.frame().width()).isEqualByComparingTo(new BigDecimal("0.4"));
        assertThat(first.fingerprint()).matches("[a-f0-9]{64}");
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
             var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT COUNT(*) FROM jar_ai_generations")) {
            rows.next(); assertThat(rows.getInt(1)).isEqualTo(2);
        }
    }

    @Test
    void originalFallbackAndImageOnlyUseSameRulesAsProduction() throws Exception {
        execute("UPDATE jar_design_drafts SET ai_input_x=NULL, ai_input_y=NULL, ai_input_width=NULL, ai_input_height=NULL, ai_input_fit=NULL");
        assertThat(AiPromptComparisonTool.readDraft(env()).frame().width()).isEqualByComparingTo(BigDecimal.ONE);
        execute("UPDATE jar_design_drafts SET selected_design_type='AI'");
        assertThat(AiPromptComparisonTool.readDraft(env()).frame()).isNull();
        execute("UPDATE jar_design_drafts SET selected_design_type='ORIGINAL',body_style=NULL");
        assertThat(AiPromptComparisonTool.readDraft(env()).frame()).isNull();
    }

    @Test
    void finalizedExpiredOrDeletedOriginalStopsBeforeReadingS3() throws Exception {
        execute("UPDATE jar_design_drafts SET status='FINALIZED'");
        assertThatThrownBy(() -> AiPromptComparisonTool.readDraft(env())).isInstanceOf(IllegalStateException.class);
        execute("UPDATE jar_design_drafts SET status='ACTIVE',expires_at='2020-01-01'");
        assertThatThrownBy(() -> AiPromptComparisonTool.readDraft(env())).isInstanceOf(IllegalStateException.class);
        execute("UPDATE jar_design_drafts SET expires_at='2099-01-01',original_s3_deleted_at='2026-01-01'");
        assertThatThrownBy(() -> AiPromptComparisonTool.readDraft(env())).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void processingOrUnrelatedHistoricalGenerationStopsComparison() throws Exception {
        execute("UPDATE jar_ai_generations SET status='PROCESSING' WHERE generation_id=131");
        assertThatThrownBy(() -> AiPromptComparisonTool.readDraft(env())).isInstanceOf(IllegalStateException.class);
        execute("UPDATE jar_ai_generations SET status='FAILED', draft_id=99 WHERE generation_id=131");
        assertThatThrownBy(() -> AiPromptComparisonTool.readDraft(env())).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void snapshotChangesOnInputEditAndReadOnlyTransactionRejectsWrites() throws Exception {
        var before = AiPromptComparisonTool.readDraft(env());
        execute("UPDATE jar_design_drafts SET ai_input_x=0.2");
        assertThat(AiPromptComparisonTool.readDraft(env()).fingerprint()).isNotEqualTo(before.fingerprint());
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword())) {
            connection.setReadOnly(true); connection.setAutoCommit(false);
            try (var statement = connection.createStatement()) {
                statement.execute("SET TRANSACTION READ ONLY");
                try (var rows = statement.executeQuery("SELECT draft_id FROM jar_design_drafts")) { rows.next(); }
                assertThatThrownBy(() -> statement.executeUpdate("UPDATE jar_design_drafts SET status='EXPIRED'"))
                        .isInstanceOf(java.sql.SQLException.class);
            } finally { connection.rollback(); }
        }
    }

    private Map<String, String> env() {
        return Map.of("SPRING_DATASOURCE_URL", DATABASE.getJdbcUrl(),
                "SPRING_DATASOURCE_USERNAME", DATABASE.getUsername(), "SPRING_DATASOURCE_PASSWORD", DATABASE.getPassword());
    }

    private void execute(String sql) throws Exception {
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
             var statement = connection.createStatement()) { statement.execute(sql); }
    }
}
