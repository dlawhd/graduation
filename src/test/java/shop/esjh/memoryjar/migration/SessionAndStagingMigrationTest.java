package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.*;

/** V53에 저장된 토큰·파일을 보존하면서 V54·V55를 순차 적용할 수 있는지 일회용 MariaDB로 확인한다. */
@Testcontainers
class SessionAndStagingMigrationTest {
    @Container static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("session_staging_upgrade").withUsername("test").withPassword("test");

    private void migrate(String target) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(target).load().migrate();
    }

    @Test void upgradeBackfillsExistingRowsWithoutChangingFilesOrRevocation() throws Exception {
        migrate("53");
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            sql.execute("INSERT INTO users(id,name,email,provider,provider_id) VALUES(1,'시험','migration@example.test','NAVER','migration')");
            sql.execute("INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES(1,REPEAT('a',64),DATE_ADD(NOW(),INTERVAL 1 DAY))");
            sql.execute("INSERT INTO file_uploads(user_id,purpose,status,s3_key,public_url,content_type,size) "
                    + "VALUES(1,'NOTE','CONSUMED','notes/legacy.png','https://fixture.invalid/legacy','image/png',10)");
        }
        migrate("55");
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            try (var rows = sql.executeQuery("SELECT session_id,revoked_at FROM refresh_tokens")) {
                assertThat(rows.next()).isTrue(); assertThat(rows.getString(1)).startsWith("legacy-");
                assertThat(rows.getTimestamp(2)).isNull();
            }
            try (var rows = sql.executeQuery("SELECT status,s3_key,TIMESTAMPDIFF(HOUR,created_at,staging_cleanup_after),staging_cleaned_at FROM file_uploads")) {
                assertThat(rows.next()).isTrue(); assertThat(rows.getString(1)).isEqualTo("CONSUMED");
                assertThat(rows.getString(2)).isEqualTo("notes/legacy.png");
                assertThat(rows.getLong(3)).isEqualTo(192); assertThat(rows.getTimestamp(4)).isNull();
            }
            assertThatThrownBy(() -> sql.execute("INSERT INTO refresh_tokens(user_id,token_hash,expires_at,session_id) "
                    + "VALUES(1,REPEAT('b',64),DATE_ADD(NOW(),INTERVAL 1 DAY),NULL)"))
                    .isInstanceOf(java.sql.SQLException.class);
        }
    }
}
