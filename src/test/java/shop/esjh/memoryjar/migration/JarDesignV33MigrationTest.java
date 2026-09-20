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

/** V33이 원본 S3 삭제 완료 시각과 터미널 Draft 제약을 실제 MariaDB에 적용하는지 검증한다. */
@Testcontainers
class JarDesignV33MigrationTest {

    @Container
    static final MariaDBContainer<?> mariaDBContainer = new MariaDBContainer<>(DockerImageName.parse("mariadb:10.11"))
            .withDatabaseName("jar_design_v33_migration_test")
            .withUsername("test")
            .withPassword("test");

    @Test
    @DisplayName("V33은 종료된 Draft 원본에만 S3 삭제 완료 시각을 기록하게 한다")
    void v33TracksOnlyTerminalDraftOriginalCleanup() throws Exception {
        Flyway.configure()
                .dataSource(mariaDBContainer.getJdbcUrl(), mariaDBContainer.getUsername(), mariaDBContainer.getPassword())
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion("33"))
                .load()
                .migrate();

        long ownerId = insertUser();
        long draftId = insertDraft(ownerId);

        assertThatThrownBy(() -> execute("""
                UPDATE jar_design_drafts
                SET original_s3_deleted_at = NOW(6)
                WHERE draft_id = ?
                """, draftId)).isInstanceOf(SQLException.class);

        execute("""
                UPDATE jar_design_drafts
                SET status = 'EXPIRED', original_s3_deleted_at = NOW(6)
                WHERE draft_id = ?
                """, draftId);

        assertThat(count("""
                SELECT COUNT(*) FROM jar_design_drafts
                WHERE draft_id = ? AND original_s3_deleted_at IS NOT NULL
                """, draftId)).isEqualTo(1);
    }

    private long insertUser() throws Exception {
        try (Connection connection = mariaDBContainer.createConnection("");
             PreparedStatement statement = connection.prepareStatement("""
                     INSERT INTO users (email, name, birthyear, provider, provider_id)
                     VALUES ('v33-owner@example.com', 'V33 테스트 사용자', '2000', 'NAVER', 'v33-owner')
                     """, PreparedStatement.RETURN_GENERATED_KEYS)) {
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                assertThat(keys.next()).isTrue();
                return keys.getLong(1);
            }
        }
    }

    private long insertDraft(long ownerId) throws Exception {
        try (Connection connection = mariaDBContainer.createConnection("");
             PreparedStatement statement = connection.prepareStatement("""
                     INSERT INTO jar_design_drafts (owner_id, original_s3_key, expires_at)
                     VALUES (?, 'drafts/v33/original.png', DATE_ADD(NOW(6), INTERVAL 1 DAY))
                     """, PreparedStatement.RETURN_GENERATED_KEYS)) {
            statement.setLong(1, ownerId);
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                assertThat(keys.next()).isTrue();
                return keys.getLong(1);
            }
        }
    }

    private void execute(String sql, long draftId) throws Exception {
        try (Connection connection = mariaDBContainer.createConnection("");
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, draftId);
            statement.executeUpdate();
        }
    }

    private long count(String sql, long draftId) throws Exception {
        try (Connection connection = mariaDBContainer.createConnection("");
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, draftId);
            try (ResultSet resultSet = statement.executeQuery()) {
                assertThat(resultSet.next()).isTrue();
                return resultSet.getLong(1);
            }
        }
    }
}
