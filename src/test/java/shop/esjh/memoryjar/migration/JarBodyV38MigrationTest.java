package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.*;

/** 실제 MariaDB의 V37→V38 업그레이드와 기존 NULL 디자인, 30개 허용값을 검증한다. */
@Testcontainers
class JarBodyV38MigrationTest {
    @Container
    static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("body_style_test").withUsername("test").withPassword("test");

    @Test
    void upgradePreservesLegacyImagesAndAllowsOnlyCatalogBodies() throws Exception {
        migrate("37");
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'test@example.com','테스트','2000','NAVER','body-test')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,expires_at) VALUES (1,'original.png',DATE_ADD(NOW(6), INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jars (jar_id,owner_id,name,theme,max_members,open_at) VALUES (1,1,'테스트','SPRING',2,DATE_ADD(NOW(6), INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jar_designs (jar_id,design_type,final_s3_key,slot_center_x,slot_center_y,slot_size_ratio) VALUES (1,'ORIGINAL','final.png',0.5,0.5,0.5)");
        }
        migrate("38");
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            for (String table : new String[]{"jar_design_drafts", "jar_designs"}) {
                String keyColumn = table.equals("jar_design_drafts") ? "original_s3_key" : "final_s3_key";
                try (var result = sql.executeQuery("SELECT body_style," + keyColumn + " FROM " + table)) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getString(1)).isNull();
                    assertThat(result.getString(2)).isEqualTo(table.equals("jar_design_drafts") ? "original.png" : "final.png");
                }
                for (JarBodyStyle body : JarBodyStyle.values()) {
                    assertThat(sql.executeUpdate("UPDATE " + table + " SET body_style='" + body.name() + "'")).isEqualTo(1);
                }
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE " + table + " SET body_style='UNKNOWN'"))
                        .isInstanceOf(SQLException.class);
                assertThat(sql.executeUpdate("UPDATE " + table + " SET body_style=NULL")).isEqualTo(1);
            }
        }
    }

    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }
}
