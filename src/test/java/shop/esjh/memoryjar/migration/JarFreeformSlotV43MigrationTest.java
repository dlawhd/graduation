package shop.esjh.memoryjar.migration;

import java.sql.SQLException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import static org.assertj.core.api.Assertions.*;

/** V42→V43이 기존 가로 입구를 보존하고 자유형 16종만 추가 허용하는지 실제 MariaDB로 검증한다. */
@Testcontainers
class JarFreeformSlotV43MigrationTest {
    @Container static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("freeform_slot_test").withUsername("test").withPassword("test");

    @Test void keepsLegacyRowsAndAllowsNewSilhouettes() throws Exception {
        migrate("42");
        try (var connection=database.createConnection(""); var sql=connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'gate@example.com','테스트','2000','NAVER','slot-v43')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,expires_at,slot_center_x,slot_center_y,slot_size_ratio,slot_style) VALUES (1,'legacy.png',DATE_ADD(NOW(6),INTERVAL 1 DAY),0.5,0.04,1,'BLOSSOM')");
            sql.executeUpdate("INSERT INTO jars (jar_id,owner_id,name,theme,max_members,open_at) VALUES (1,1,'테스트','SPRING',2,DATE_ADD(NOW(6),INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jar_designs (jar_id,design_type,final_s3_key,slot_center_x,slot_center_y,slot_size_ratio,slot_style) VALUES (1,'ORIGINAL','final.png',0.5,0.04,1,'BLOSSOM')");
            for (String table:new String[]{"jar_design_drafts","jar_designs"})
                assertThatThrownBy(()->sql.executeUpdate("UPDATE "+table+" SET slot_style='BLOSSOM_GATE'")).isInstanceOf(SQLException.class);
        }
        migrate("43");
        try (var connection=database.createConnection(""); var sql=connection.createStatement()) {
            for (String table:new String[]{"jar_design_drafts","jar_designs"}) {
                try (var row=sql.executeQuery("SELECT slot_style,slot_center_y,slot_size_ratio FROM "+table)) {
                    assertThat(row.next()).isTrue(); assertThat(row.getString(1)).isEqualTo("BLOSSOM");
                    assertThat(row.getBigDecimal(2)).isEqualByComparingTo("0.04");
                    assertThat(row.getBigDecimal(3)).isEqualByComparingTo("1");
                }
                for (JarSlotStyle style:JarSlotStyle.values())
                    assertThat(sql.executeUpdate("UPDATE "+table+" SET slot_style='"+style.name()+"'")).isEqualTo(1);
                for (String invalid:new String[]{"UNKNOWN","","FLOWER"})
                    assertThatThrownBy(()->sql.executeUpdate("UPDATE "+table+" SET slot_style='"+invalid+"'")).isInstanceOf(SQLException.class);
                assertThatThrownBy(()->sql.executeUpdate("UPDATE "+table+" SET slot_style=NULL")).isInstanceOf(SQLException.class);
            }
        }
    }

    /** 격리된 테스트 DB에만 적용한다. 운영 데이터에 접근하지 않는다. */
    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(),database.getUsername(),database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }
}
