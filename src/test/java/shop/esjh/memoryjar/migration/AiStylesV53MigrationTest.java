package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.*;

/** 실제 MariaDB에서 V52 후보를 보존하면서 새 스타일만 추가하고 PIXEL 전용 제약을 유지하는지 검사한다. */
@Testcontainers
class AiStylesV53MigrationTest {
    @Container
    static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("ai_styles_v53").withUsername("test").withPassword("test");

    @Test
    void upgradePreservesOldCandidateAndAcceptsOnlyValidNewStyles() throws Exception {
        migrate("52");
        execute("INSERT INTO users(id,name,email,provider,provider_id) VALUES(1,'시험','styles@example.test','NAVER','styles-v53')");
        execute("INSERT INTO jar_design_drafts(draft_id,owner_id,original_s3_key,expires_at) VALUES(1,1,'original.png',DATE_ADD(NOW(),INTERVAL 1 DAY))");
        // DATETIME(6)의 생성 시각보다 초 단위 완료 시각이 앞서지 않도록 같은 정밀도로 기록한다.
        execute("INSERT INTO jar_ai_generations(generation_id,draft_id,ai_style,status,ai_provider,ai_model,prompt_version,generated_s3_key,created_at,completed_at) VALUES(1,1,'CUTE_2D','SUCCEEDED','CLOUDFLARE','fixture','BASE_V3+CUTE_2D_V2','old.png',NOW(6),NOW(6))");
        assertThatThrownBy(() -> insert("NEON_DRAWING", null, null)).isInstanceOf(SQLException.class);
        migrate("53");
        try (var connection = database.createConnection(""); var statement = connection.createStatement();
             var row = statement.executeQuery("SELECT ai_style,prompt_version,generated_s3_key FROM jar_ai_generations WHERE generation_id=1")) {
            assertThat(row.next()).isTrue();
            assertThat(row.getString(1)).isEqualTo("CUTE_2D");
            assertThat(row.getString(2)).isEqualTo("BASE_V3+CUTE_2D_V2");
            assertThat(row.getString(3)).isEqualTo("old.png");
        }
        for (String style : new String[]{"CUTE_2D", "SOFT_25D", "WATERCOLOR", "HAND_DRAWN", "WEIRDO", "NEON_DRAWING", "CHROME_MIRROR", "RISO_PRINT"}) {
            assertThat(insert(style, null, null)).isEqualTo(1);
            assertThatThrownBy(() -> insert(style, "REFERENCE", null)).isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> insert(style, null, "PIXEL_PP_V3")).isInstanceOf(SQLException.class);
        }
        assertThat(insert("PIXEL", null, "PIXEL_PP_V3")).isEqualTo(1);
        assertThat(insert("PIXEL", "PIXEL_REF_V1", "PIXEL_PP_V1")).isEqualTo(1);
        assertThatThrownBy(() -> insert("PIXEL", null, null)).isInstanceOf(SQLException.class);
        assertThatThrownBy(() -> insert("PIXEL", " ", "PIXEL_PP_V3")).isInstanceOf(SQLException.class);
        assertThatThrownBy(() -> insert("NOT_A_STYLE", null, null)).isInstanceOf(SQLException.class);
    }

    /** 지정한 버전까지 실제 운영 Migration을 순서대로 적용한다. */
    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }

    private void execute(String sql) throws SQLException {
        try (var connection = database.createConnection(""); var statement = connection.createStatement()) { statement.execute(sql); }
    }

    private int insert(String style, String reference, String postprocess) throws SQLException {
        try (var connection = database.createConnection(""); var statement = connection.prepareStatement("INSERT INTO jar_ai_generations(draft_id,ai_style,ai_provider,ai_model,prompt_version,reference_image_version,postprocess_version) VALUES(1,?,'CLOUDFLARE','fixture','fixture-v1',?,?)")) {
            statement.setString(1, style); statement.setString(2, reference); statement.setString(3, postprocess);
            return statement.executeUpdate();
        }
    }
}
