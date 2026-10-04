package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.*;

/** 실제 MariaDB에서 V41→V42 입구 허용값 확장과 기존 본체·사진·좌표·기본값 보존을 검증한다. */
@Testcontainers
class JarSlotStyleV42MigrationTest {
    @Container static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("decorative_slot_test").withUsername("test").withPassword("test");

    @Test void upgradesWithoutReinterpretingExistingSlots() throws Exception {
        migrate("41");
        try (var connection=database.createConnection(""); var sql=connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'slot@example.com','테스트','2000','NAVER','slot-v42')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,body_style,selected_design_type,expires_at,photo_x,photo_y,photo_width,photo_height,photo_fit,slot_center_x,slot_center_y,slot_size_ratio,slot_style) VALUES (1,'original.png','AXOLOTL','ORIGINAL',DATE_ADD(NOW(6),INTERVAL 1 DAY),0,0.25,1,0.5,'CONTAIN',0.31,0.72,0.3,'METAL')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,expires_at) VALUES (1,'legacy.png',DATE_ADD(NOW(6),INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jars (jar_id,owner_id,name,theme,max_members,open_at) VALUES (1,1,'테스트','SPRING',2,DATE_ADD(NOW(6),INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jar_designs (jar_id,design_type,final_s3_key,body_style,slot_center_x,slot_center_y,slot_size_ratio,slot_style,photo_x,photo_y,photo_width,photo_height,photo_fit) VALUES (1,'ORIGINAL','final.png','AXOLOTL',0.31,0.72,0.3,'METAL',0,0.25,1,0.5,'CONTAIN')");
            for (String table : new String[]{"jar_design_drafts","jar_designs"})
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE " + table + " SET slot_style='PAW'"))
                        .isInstanceOf(SQLException.class);
        }
        migrate("42");
        try (var connection=database.createConnection(""); var sql=connection.createStatement()) {
            for (String table : new String[]{"jar_design_drafts","jar_designs"}) {
                String where = table.equals("jar_design_drafts") ? " WHERE original_s3_key='original.png'" : " WHERE final_s3_key='final.png'";
                try (var row=sql.executeQuery("SELECT slot_style,slot_center_x,slot_center_y,slot_size_ratio,body_style,photo_y,photo_fit FROM " + table + where)) {
                    assertThat(row.next()).isTrue(); assertThat(row.getString(1)).isEqualTo("METAL");
                    assertThat(row.getBigDecimal(2)).isEqualByComparingTo("0.31");
                    assertThat(row.getBigDecimal(3)).isEqualByComparingTo("0.72");
                    assertThat(row.getBigDecimal(4)).isEqualByComparingTo("0.3");
                    assertThat(row.getString(5)).isEqualTo("AXOLOTL");
                    assertThat(row.getBigDecimal(6)).isEqualByComparingTo("0.25");
                    assertThat(row.getString(7)).isEqualTo("CONTAIN");
                }
                // 이 테스트는 V42 당시 계약만 검증한다. 이후 자유형 ID는 V43에서 추가된다.
                for (JarSlotStyle style : JarSlotStyle.values()) {
                    if (style.aspectRatio().compareTo(new java.math.BigDecimal("3.5")) != 0) continue;
                    assertThat(sql.executeUpdate("UPDATE " + table + " SET slot_style='" + style.name() + "'" + where)).isEqualTo(1);
                }
                for (String invalid : new String[]{"UNKNOWN", "", "PAWS"})
                    assertThatThrownBy(() -> sql.executeUpdate("UPDATE " + table + " SET slot_style='" + invalid + "'" + where)).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE " + table + " SET slot_style=NULL" + where)).isInstanceOf(SQLException.class);
            }
            try (var row=sql.executeQuery("SELECT slot_style,body_style,slot_center_x FROM jar_design_drafts WHERE original_s3_key='legacy.png'")) {
                assertThat(row.next()).isTrue(); assertThat(row.getString(1)).isEqualTo("CAPSULE");
                assertThat(row.getString(2)).isNull(); assertThat(row.getBigDecimal(3)).isNull();
            }
        }
    }

    /** 이전 버전까지 적용 후 같은 DB를 업그레이드해 데이터 보존을 검사한다. */
    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(),database.getUsername(),database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }
}
