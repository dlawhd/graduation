package shop.esjh.memoryjar.migration;

import java.sql.SQLException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import static org.assertj.core.api.Assertions.*;

/** V43→V44의 기존 행 보존, 원본 배치 복원, 새 입구/작은 크기 제약을 격리된 MariaDB에서 검증한다. */
@Testcontainers
class JarSlotsAndAiInputV44MigrationTest {
    @Container static final MariaDBContainer<?> database=new MariaDBContainer<>("mariadb:10.11")
        .withDatabaseName("slot_input_test").withUsername("test").withPassword("test");

    @Test void preservesRowsBackfillsOnlyOriginalAndEnforcesNewConstraints() throws Exception {
        migrate("43");
        try(var connection=database.createConnection("");var sql=connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'v44@example.com','테스트','2000','NAVER','v44')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,body_style,selected_design_type,expires_at,photo_x,photo_y,photo_width,photo_height,slot_center_x,slot_center_y,slot_size_ratio) VALUES (1,'original.png','CAT','ORIGINAL',DATE_ADD(NOW(6),INTERVAL 1 DAY),0.2,0.25,0.6,0.5,0.31,0.72,0.3)");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,body_style,selected_design_type,expires_at) VALUES (1,'default.png','CAT','DEFAULT',DATE_ADD(NOW(6),INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jars (jar_id,owner_id,name,theme,max_members,open_at) VALUES (1,1,'테스트','SPRING',2,DATE_ADD(NOW(6),INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jar_designs (jar_id,design_type,final_s3_key,slot_center_x,slot_center_y,slot_size_ratio) VALUES (1,'ORIGINAL','final.png',0.31,0.72,0.3)");
        }
        migrate("44");
        try(var connection=database.createConnection("");var sql=connection.createStatement()) {
            try(var row=sql.executeQuery("SELECT ai_input_x,ai_input_width,ai_input_fit FROM jar_design_drafts WHERE original_s3_key='original.png'")) {
                assertThat(row.next()).isTrue();assertThat(row.getBigDecimal(1)).isEqualByComparingTo(".2");
                assertThat(row.getBigDecimal(2)).isEqualByComparingTo(".6");assertThat(row.getString(3)).isEqualTo("COVER");
            }
            try(var row=sql.executeQuery("SELECT ai_input_x FROM jar_design_drafts WHERE original_s3_key='default.png'")) {
                assertThat(row.next()).isTrue();assertThat(row.getObject(1)).isNull();
            }
            for(String table:new String[]{"jar_design_drafts","jar_designs"}) {
                try(var rows=sql.executeQuery("SELECT slot_center_x,slot_center_y,slot_size_ratio FROM "+table+" WHERE slot_center_x IS NOT NULL")) {
                    assertThat(rows.next()).isTrue();assertThat(rows.getBigDecimal(1)).isEqualByComparingTo(".31");
                    assertThat(rows.getBigDecimal(2)).isEqualByComparingTo(".72");assertThat(rows.getBigDecimal(3)).isEqualByComparingTo(".3");
                }
                for(JarSlotStyle style:JarSlotStyle.values())
                    assertThat(sql.executeUpdate("UPDATE "+table+" SET slot_style='"+style.name()+"' WHERE slot_center_x IS NOT NULL")).isPositive();
                sql.executeUpdate("UPDATE "+table+" SET slot_center_x=.5,slot_center_y=.5,slot_size_ratio=-.5 WHERE slot_center_x IS NOT NULL");
                for(String invalid:new String[]{"-.50001","1.00001"})
                    assertThatThrownBy(()->sql.executeUpdate("UPDATE "+table+" SET slot_size_ratio="+invalid)).isInstanceOf(SQLException.class);
                assertThatThrownBy(()->sql.executeUpdate("UPDATE "+table+" SET slot_style='INVALID'")).isInstanceOf(SQLException.class);
                assertThatThrownBy(()->sql.executeUpdate("UPDATE "+table+" SET slot_center_x=NULL")).isInstanceOf(SQLException.class);
            }
            for(String invalid:new String[]{"ai_input_x=NULL","ai_input_width=0","ai_input_x=.9","ai_input_fit='STRETCH'","ai_input_fit=NULL"})
                assertThatThrownBy(()->sql.executeUpdate("UPDATE jar_design_drafts SET "+invalid+" WHERE original_s3_key='original.png'")).isInstanceOf(SQLException.class);
            sql.executeUpdate("UPDATE jar_design_drafts SET ai_input_fit='CONTAIN' WHERE original_s3_key='original.png'");
        }
    }
    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(),database.getUsername(),database.getPassword())
            .locations("classpath:db/migration").target(version).load().migrate();
    }
}
