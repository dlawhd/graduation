package shop.esjh.memoryjar.migration;

import java.sql.SQLException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import static org.assertj.core.api.Assertions.*;

/** 실제 MariaDB에서 V44→V45 업그레이드, 숨긴 입구 보존 및 새 소품 36종의 저장 제약을 검증한다. */
@Testcontainers
class JarCuteSlotV45MigrationTest {
    @Container static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
        .withDatabaseName("cute_slot_test").withUsername("test").withPassword("test");

    @Test void preservesHiddenSlotAndAllGeometryWhileAddingCuteStyles() throws Exception {
        migrate("44");
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'v45@example.com','검증','2000','NAVER','v45')");
            sql.executeUpdate("INSERT INTO jars (jar_id,owner_id,name,theme,max_members,open_at) VALUES (1,1,'검증','SPRING',2,DATE_ADD(NOW(6),INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,body_style,selected_design_type,expires_at,slot_style,slot_center_x,slot_center_y,slot_size_ratio,photo_x,photo_y,photo_width,photo_height,photo_fit,ai_input_x,ai_input_y,ai_input_width,ai_input_height,ai_input_fit) VALUES (1,'original.png','CAT','ORIGINAL',DATE_ADD(NOW(6),INTERVAL 1 DAY),'SPIRAL_GATE',.31,.72,-.5,.2,.25,.6,.5,'COVER',.2,.25,.6,.5,'COVER')");
            sql.executeUpdate("INSERT INTO jar_designs (jar_id,design_type,final_s3_key,slot_style,slot_center_x,slot_center_y,slot_size_ratio) VALUES (1,'ORIGINAL','final.png','SPIRAL_GATE',.31,.72,-.5)");
        }
        migrate("45");
        try (var connection = database.createConnection(""); var sql = connection.createStatement()) {
            for (String table : new String[]{"jar_design_drafts", "jar_designs"}) {
                try (var row = sql.executeQuery("SELECT slot_style,slot_center_x,slot_center_y,slot_size_ratio FROM " + table)) {
                    assertThat(row.next()).isTrue(); assertThat(row.getString(1)).isEqualTo("SPIRAL_GATE");
                    assertThat(row.getBigDecimal(2)).isEqualByComparingTo(".31");
                    assertThat(row.getBigDecimal(3)).isEqualByComparingTo(".72");
                    assertThat(row.getBigDecimal(4)).isEqualByComparingTo("-.5");
                }
                assertThat(JarSlotStyle.values()).hasSize(156);
                for (JarSlotStyle style : JarSlotStyle.values())
                    assertThat(sql.executeUpdate("UPDATE " + table + " SET slot_style='" + style.name() + "'")).isEqualTo(1);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE " + table + " SET slot_style='INVALID'")).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE " + table + " SET slot_style=NULL")).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE " + table + " SET slot_size_ratio=-.50001")).isInstanceOf(SQLException.class);
            }
            try (var row = sql.executeQuery("SELECT photo_x,ai_input_x,ai_input_fit FROM jar_design_drafts")) {
                assertThat(row.next()).isTrue(); assertThat(row.getBigDecimal(1)).isEqualByComparingTo(".2");
                assertThat(row.getBigDecimal(2)).isEqualByComparingTo(".2"); assertThat(row.getString(3)).isEqualTo("COVER");
            }
        }
    }

    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
            .locations("classpath:db/migration").target(version).load().migrate();
    }
}
