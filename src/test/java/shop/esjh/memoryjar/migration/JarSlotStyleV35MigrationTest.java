package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.*;

/** 기존 V34 디자인을 V35로 올렸을 때 기본 모양과 DB 허용값 제약이 유지되는지 실제 MariaDB에서 검증한다. */
@Testcontainers
class JarSlotStyleV35MigrationTest {
    @Container
    static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("slot_style_test").withUsername("test").withPassword("test");

    @Test
    void upgradePreservesExistingDesignsAndRejectsUnknownStyles() throws Exception {
        migrate("34");
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'test@example.com','테스트','2000','NAVER','slot-test')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,expires_at) VALUES (1,'original.png',DATE_ADD(NOW(6), INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jars (jar_id,owner_id,name,theme,max_members,open_at) VALUES (1,1,'테스트','SPRING',2,DATE_ADD(NOW(6), INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jar_designs (jar_id,design_type,final_s3_key,slot_center_x,slot_center_y,slot_size_ratio) VALUES (1,'ORIGINAL','final.png',0.5,0.5,0.5)");
        }
        migrate("35");
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            for (String table : new String[]{"jar_design_drafts", "jar_designs"}) {
                try (var result = sql.executeQuery("SELECT slot_style FROM " + table)) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getString(1)).isEqualTo("CAPSULE");
                }
                for (String style : new String[]{"CAPSULE", "RECTANGLE", "OVAL", "METAL", "WOOD", "PIXEL"}) {
                    assertThat(sql.executeUpdate("UPDATE " + table + " SET slot_style='" + style + "'")).isEqualTo(1);
                }
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE " + table + " SET slot_style='UNKNOWN'"))
                        .isInstanceOf(SQLException.class);
            }
        }
    }

    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }
}
