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

/**
 * V32가 실제 MariaDB 10.11에서 AI Draft, Generation, 최종 디자인 테이블과 핵심 제약을 만드는지 검증한다.
 * JPA가 아닌 JDBC를 사용해 Flyway SQL과 MariaDB CHECK/FK 동작 자체를 직접 확인한다.
 */
@Testcontainers
class JarDesignV32MigrationTest {

    @Container
    static final MariaDBContainer<?> mariaDBContainer = new MariaDBContainer<>(DockerImageName.parse("mariadb:10.11"))
            .withDatabaseName("jar_design_v32_migration_test")
            .withUsername("test")
            .withPassword("test");

    @Test
    @DisplayName("V32는 Draft 기반 AI 디자인 스키마와 핵심 DB 제약을 생성한다")
    void v32CreatesAiJarDesignSchema() throws Exception {
        migrateToVersion("31");
        assertThat(tableExists("jar_design_drafts")).isFalse();
        assertThat(tableExists("jar_ai_generations")).isFalse();
        assertThat(tableExists("jar_designs")).isFalse();

        migrateToVersion("32");
        assertThat(findCurrentFlywayVersion()).isEqualTo("32");
        assertThat(tableExists("jar_design_drafts")).isTrue();
        assertThat(tableExists("jar_ai_generations")).isTrue();
        assertThat(tableExists("jar_designs")).isTrue();

        long ownerId = insertUser("v32-owner@example.com", "v32-owner");
        long firstDraftId = insertDraft(ownerId, "drafts/v32/original-1.png");
        long secondDraftId = insertDraft(ownerId, "drafts/v32/original-2.png");

        // PIXEL은 Reference/후처리 버전 없이 저장하면 안 된다.
        assertThatThrownBy(() -> insertProcessingGeneration(firstDraftId, "PIXEL", null, null))
                .isInstanceOf(SQLException.class);

        long succeededGenerationId = insertSucceededGeneration(firstDraftId);
        assertThatThrownBy(() -> selectAiGeneration(secondDraftId, succeededGenerationId))
                .isInstanceOf(SQLException.class);

        selectAiGeneration(firstDraftId, succeededGenerationId);

        // PROCESSING 상태인데 completed_at을 기록하는 모순된 상태도 DB가 거절한다.
        assertThatThrownBy(() -> insertInvalidProcessingGeneration(firstDraftId))
                .isInstanceOf(SQLException.class);
    }

    private void migrateToVersion(String version) {
        Flyway.configure()
                .dataSource(mariaDBContainer.getJdbcUrl(), mariaDBContainer.getUsername(), mariaDBContainer.getPassword())
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion(version))
                .load()
                .migrate();
    }

    private boolean tableExists(String tableName) throws Exception {
        return count("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?", tableName) == 1;
    }

    private long insertUser(String email, String providerId) throws Exception {
        return insertAndGetId("""
                INSERT INTO users (email, name, birthyear, provider, provider_id)
                VALUES (?, 'V32 테스트 사용자', '2000', 'NAVER', ?)
                """, email, providerId);
    }

    private long insertDraft(long ownerId, String originalS3Key) throws Exception {
        return insertAndGetId("""
                INSERT INTO jar_design_drafts (owner_id, original_s3_key, expires_at)
                VALUES (?, ?, DATE_ADD(NOW(6), INTERVAL 1 DAY))
                """, ownerId, originalS3Key);
    }

    private long insertSucceededGeneration(long draftId) throws Exception {
        return insertAndGetId("""
                INSERT INTO jar_ai_generations (
                    draft_id, ai_style, status, ai_provider, ai_model, prompt_version,
                    generated_s3_key, completed_at
                ) VALUES (?, 'CUTE_2D', 'SUCCEEDED', 'CLOUDFLARE', 'test-model', 'BASE_V1+CUTE_2D_V1', ?, NOW(6))
                """, draftId, "generations/v32/succeeded.png");
    }

    private void insertProcessingGeneration(long draftId, String style, String referenceVersion, String postprocessVersion) throws Exception {
        execute("""
                INSERT INTO jar_ai_generations (
                    draft_id, ai_style, ai_provider, ai_model, prompt_version,
                    reference_image_version, postprocess_version
                ) VALUES (?, ?, 'CLOUDFLARE', 'test-model', 'test-prompt', ?, ?)
                """, draftId, style, referenceVersion, postprocessVersion);
    }

    private void insertInvalidProcessingGeneration(long draftId) throws Exception {
        execute("""
                INSERT INTO jar_ai_generations (
                    draft_id, ai_style, status, ai_provider, ai_model, prompt_version, completed_at
                ) VALUES (?, 'CUTE_2D', 'PROCESSING', 'CLOUDFLARE', 'test-model', 'test-prompt', NOW(6))
                """, draftId);
    }

    private void selectAiGeneration(long draftId, long generationId) throws Exception {
        execute("""
                UPDATE jar_design_drafts
                SET selected_design_type = 'AI', selected_generation_id = ?,
                    slot_center_x = 0.50000, slot_center_y = 0.50000, slot_size_ratio = 0.30000
                WHERE draft_id = ?
                """, generationId, draftId);
    }

    private long insertAndGetId(String sql, Object... values) throws Exception {
        try (Connection connection = mariaDBContainer.createConnection("");
             PreparedStatement statement = connection.prepareStatement(sql, PreparedStatement.RETURN_GENERATED_KEYS)) {
            bind(statement, values);
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                assertThat(keys.next()).isTrue();
                return keys.getLong(1);
            }
        }
    }

    private void execute(String sql, Object... values) throws Exception {
        try (Connection connection = mariaDBContainer.createConnection("");
             PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, values);
            statement.executeUpdate();
        }
    }

    private long count(String sql, Object... values) throws Exception {
        try (Connection connection = mariaDBContainer.createConnection("");
             PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, values);
            try (ResultSet resultSet = statement.executeQuery()) {
                assertThat(resultSet.next()).isTrue();
                return resultSet.getLong(1);
            }
        }
    }

    private void bind(PreparedStatement statement, Object... values) throws SQLException {
        for (int index = 0; index < values.length; index++) {
            statement.setObject(index + 1, values[index]);
        }
    }

    private String findCurrentFlywayVersion() throws Exception {
        try (Connection connection = mariaDBContainer.createConnection("");
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT version FROM flyway_schema_history
                     WHERE success = 1 AND version IS NOT NULL
                     ORDER BY installed_rank DESC LIMIT 1
                     """);
             ResultSet resultSet = statement.executeQuery()) {
            assertThat(resultSet.next()).isTrue();
            return resultSet.getString("version");
        }
    }
}
