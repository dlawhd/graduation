package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.*;

/** 격리 MariaDB에서 V40→V41 허용값 확장과 기존 사진·입구·NULL 보존을 검증한다. */
@Testcontainers
class JarAnimalV41MigrationTest {
    @Container static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("animal_body_test").withUsername("test").withPassword("test");

    @Test void expandsCatalogWithoutRewritingExistingDesign() throws Exception {
        migrate("40");
        try (var connection=database.createConnection(""); var sql=connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'animal@example.com','테스트','2000','NAVER','animal-test')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,body_style,selected_design_type,expires_at,photo_x,photo_y,photo_width,photo_height,photo_fit,slot_center_x,slot_center_y,slot_size_ratio) VALUES (1,'original.png','CAT','ORIGINAL',DATE_ADD(NOW(6),INTERVAL 1 DAY),0,0.25,1,0.5,'CONTAIN',0.3,0.4,0.2)");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,expires_at) VALUES (1,'legacy.png',DATE_ADD(NOW(6),INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jars (jar_id,owner_id,name,theme,max_members,open_at) VALUES (1,1,'테스트','SPRING',2,DATE_ADD(NOW(6),INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jar_designs (jar_id,design_type,final_s3_key,body_style,slot_center_x,slot_center_y,slot_size_ratio,photo_x,photo_y,photo_width,photo_height,photo_fit) VALUES (1,'ORIGINAL','final.png','CAT',0.3,0.4,0.2,0,0.25,1,0.5,'CONTAIN')");
            assertThatThrownBy(() -> sql.executeUpdate("UPDATE jar_designs SET body_style='AXOLOTL'"))
                    .isInstanceOf(SQLException.class);
        }
        migrate("41");
        try (var connection=database.createConnection(""); var sql=connection.createStatement()) {
            for (String table : new String[]{"jar_design_drafts","jar_designs"}) {
                String key = table.equals("jar_design_drafts") ? "original_s3_key" : "final_s3_key";
                String where = " WHERE " + key + "='" + (table.equals("jar_design_drafts") ? "original.png" : "final.png") + "'";
                try (var rows=sql.executeQuery("SELECT body_style,photo_y,photo_fit,slot_center_x,slot_center_y,slot_size_ratio FROM " + table + where)) {
                    assertThat(rows.next()).isTrue(); assertThat(rows.getString(1)).isEqualTo("CAT");
                    assertThat(rows.getBigDecimal(2)).isEqualByComparingTo("0.25");
                    assertThat(rows.getString(3)).isEqualTo("CONTAIN");
                    assertThat(rows.getBigDecimal(4)).isEqualByComparingTo("0.3");
                    assertThat(rows.getBigDecimal(5)).isEqualByComparingTo("0.4");
                    assertThat(rows.getBigDecimal(6)).isEqualByComparingTo("0.2");
                }
                for (JarBodyStyle body : JarBodyStyle.values())
                    // V41은 당시 고정 50종만 검증한다. CUSTOM은 V51에서 별도 검증한다.
                    if (body != JarBodyStyle.CUSTOM)
                    assertThat(sql.executeUpdate("UPDATE " + table + " SET body_style='" + body.name() + "'" + where)).isEqualTo(1);
                for (String unknown : new String[]{"UNKNOWN","DOGG", ""})
                    assertThatThrownBy(() -> sql.executeUpdate("UPDATE " + table + " SET body_style='" + unknown + "'" + where)).isInstanceOf(SQLException.class);
                assertThat(sql.executeUpdate("UPDATE " + table + " SET body_style=NULL,photo_x=NULL,photo_y=NULL,photo_width=NULL,photo_height=NULL,photo_fit=NULL" + where)).isEqualTo(1);
            }
            try (var rows=sql.executeQuery("SELECT body_style,photo_fit,original_s3_key FROM jar_design_drafts WHERE original_s3_key='legacy.png'")) {
                assertThat(rows.next()).isTrue(); assertThat(rows.getString(1)).isNull();
                assertThat(rows.getString(2)).isNull(); assertThat(rows.getString(3)).isEqualTo("legacy.png");
            }
        }
    }

    /** 특정 버전까지 순차 적용해 신규 설치뿐 아니라 기존 데이터의 업그레이드도 검증한다. */
    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(),database.getUsername(),database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }
}
