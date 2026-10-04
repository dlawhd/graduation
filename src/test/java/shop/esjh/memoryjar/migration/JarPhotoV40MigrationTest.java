package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.*;

/** 운영이 아닌 MariaDB에서 V39 배치 보존과 V40 표시 방식의 DB 검증을 확인한다. */
@Testcontainers
class JarPhotoV40MigrationTest {
    @Container static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("photo_fit_test").withUsername("test").withPassword("test");
    @Test void upgradePreservesV39AndRejectsUnknownOrOrphanFit() throws Exception {
        migrate("39");
        try(var connection=database.createConnection("");var sql=connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'fit@example.com','테스트','2000','NAVER','fit-test')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,body_style,selected_design_type,expires_at,photo_x,photo_y,photo_width,photo_height) VALUES (1,'original.png','CAT','ORIGINAL',DATE_ADD(NOW(6), INTERVAL 1 DAY),0,0.25,1,0.5)");
            sql.executeUpdate("INSERT INTO jars (jar_id,owner_id,name,theme,max_members,open_at) VALUES (1,1,'테스트','SPRING',2,DATE_ADD(NOW(6), INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jar_designs (jar_id,design_type,final_s3_key,body_style,slot_center_x,slot_center_y,slot_size_ratio,photo_x,photo_y,photo_width,photo_height) VALUES (1,'ORIGINAL','final.png','CAT',0.5,0.5,0.5,0,0.25,1,0.5)");
        }
        migrate("40");
        try(var connection=database.createConnection("");var sql=connection.createStatement()) {
            for(String table:new String[]{"jar_design_drafts","jar_designs"}) {
                try(var rows=sql.executeQuery("SELECT photo_y,photo_width,photo_fit FROM "+table)) {
                    assertThat(rows.next()).isTrue(); assertThat(rows.getBigDecimal(1)).isEqualByComparingTo("0.25");
                    assertThat(rows.getBigDecimal(2)).isEqualByComparingTo("1"); assertThat(rows.getString(3)).isNull();
                }
                for(String fit:new String[]{"CONTAIN","COVER"}) assertThat(sql.executeUpdate("UPDATE "+table+" SET photo_fit='"+fit+"'")).isEqualTo(1);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE "+table+" SET photo_fit='STRETCH'")).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE "+table+" SET photo_x=NULL,photo_y=NULL,photo_width=NULL,photo_height=NULL")).isInstanceOf(SQLException.class);
                assertThat(sql.executeUpdate("UPDATE "+table+" SET photo_x=NULL,photo_y=NULL,photo_width=NULL,photo_height=NULL,photo_fit=NULL")).isEqualTo(1);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE "+table+" SET photo_fit='CONTAIN'")).isInstanceOf(SQLException.class);
            }
            assertThatThrownBy(() -> sql.executeUpdate("UPDATE jar_design_drafts SET original_fit='COVER'")).isInstanceOf(SQLException.class);
            sql.executeUpdate("UPDATE jar_design_drafts SET original_x=0,original_y=0.25,original_width=1,original_height=0.5,original_fit='COVER'");
            assertThatThrownBy(() -> sql.executeUpdate("UPDATE jar_design_drafts SET original_fit='CONTAIN'")).isInstanceOf(SQLException.class);
        }
    }
    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(),database.getUsername(),database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }
}
