package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** V35에서 V36으로 올릴 때 과거 PIXEL 이력을 보존하고 참조 없는 신규 생성만 허용하는지 실제 MariaDB에서 검증한다. */
@Testcontainers
class PixelReferenceV36MigrationTest {

    @Container
    static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("pixel_reference_test").withUsername("test").withPassword("test");

    @Test
    @DisplayName("V36는 기존 후보를 보존하고 참조 없는 PIXEL을 허용하되 빈 버전과 다른 스타일의 메타데이터는 거절한다")
    void upgradePreservesLegacyAndValidatesOptionalReference() throws Exception {
        migrate("35");
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'pixel-test@example.com','테스트','2000','NAVER','pixel-test')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (draft_id,owner_id,original_s3_key,expires_at) VALUES (1,1,'original.png',DATE_ADD(NOW(6), INTERVAL 1 DAY))");
            sql.executeUpdate("""
                    INSERT INTO jar_ai_generations (generation_id,draft_id,ai_style,status,ai_provider,ai_model,
                        prompt_version,seed,reference_image_version,postprocess_version,generated_s3_key,completed_at)
                    VALUES (1,1,'PIXEL','SUCCEEDED','CLOUDFLARE','test-model','PIXEL_V5',7,
                        'PIXEL_REF_V1','PIXEL_PP_V2','legacy.png',NOW(6))
                    """);
        }
        assertThatThrownBy(() -> insert("PIXEL", null, "PIXEL_PP_V2")).isInstanceOf(SQLException.class);

        migrate("36");
        // 제약만 교체하므로 저장된 이미지와 재현용 메타데이터는 그대로 남아야 한다.
        try (var connection = database.createConnection(""); var sql = connection.createStatement();
             var result = sql.executeQuery("SELECT * FROM jar_ai_generations WHERE generation_id=1")) {
            assertThat(result.next()).isTrue();
            assertThat(result.getString("prompt_version")).isEqualTo("PIXEL_V5");
            assertThat(result.getString("reference_image_version")).isEqualTo("PIXEL_REF_V1");
            assertThat(result.getString("postprocess_version")).isEqualTo("PIXEL_PP_V2");
            assertThat(result.getString("generated_s3_key")).isEqualTo("legacy.png");
            assertThat(result.getString("status")).isEqualTo("SUCCEEDED");
            assertThat(result.getLong("seed")).isEqualTo(7L);
        }
        assertThat(insert("PIXEL", null, "PIXEL_PP_V2")).isEqualTo(1);
        assertThat(insert("PIXEL", "PIXEL_REF_V1", "PIXEL_PP_V2")).isEqualTo(1);
        assertThatThrownBy(() -> insert("PIXEL", " ", "PIXEL_PP_V2")).isInstanceOf(SQLException.class);
        assertThatThrownBy(() -> insert("PIXEL", null, null)).isInstanceOf(SQLException.class);
        assertThatThrownBy(() -> insert("PIXEL", null, " ")).isInstanceOf(SQLException.class);
        for (String style : new String[]{"CUTE_2D", "SOFT_25D", "WATERCOLOR", "HAND_DRAWN", "WEIRDO"}) {
            assertThat(insert(style, null, null)).isEqualTo(1);
            assertThatThrownBy(() -> insert(style, "PIXEL_REF_V1", null)).isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> insert(style, null, "PIXEL_PP_V2")).isInstanceOf(SQLException.class);
        }
    }

    /** 운영과 같은 Flyway 경로에서 단계별 업그레이드를 수행하며 기존 SQL은 수정하지 않는다. */
    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }

    /** NULL은 참조 없음이고 빈 문자열은 잘못된 이력이므로, 실제 바인딩 값으로 CHECK를 검증한다. */
    private int insert(String style, String reference, String postprocess) throws SQLException {
        try (var connection = database.createConnection(""); var statement = connection.prepareStatement("""
                INSERT INTO jar_ai_generations (draft_id,ai_style,ai_provider,ai_model,prompt_version,
                    reference_image_version,postprocess_version)
                VALUES (1,?,'CLOUDFLARE','test-model','BASE_V2+PIXEL_V6',?,?)
                """)) {
            statement.setString(1, style);
            statement.setString(2, reference);
            statement.setString(3, postprocess);
            return statement.executeUpdate();
        }
    }
}
