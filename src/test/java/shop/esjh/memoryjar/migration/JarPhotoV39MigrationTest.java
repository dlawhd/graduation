package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.SQLException;
import static org.assertj.core.api.Assertions.*;

/** 비운영 MariaDB에서 V38→V39 기존 디자인 보존과 부분 NULL/잘못된 사진 좌표 차단을 검증한다. */
@Testcontainers
class JarPhotoV39MigrationTest {
    @Container static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("photo_test").withUsername("test").withPassword("test");
    @Test void upgradeKeepsLegacyAndEnforcesCompleteInBoundsFrames() throws Exception {
        migrate("38");
        try(var connection=database.createConnection("");var sql=connection.createStatement()) {
            sql.executeUpdate("INSERT INTO users (id,email,name,birthyear,provider,provider_id) VALUES (1,'test@example.com','테스트','2000','NAVER','photo-test')");
            sql.executeUpdate("INSERT INTO jar_design_drafts (owner_id,original_s3_key,body_style,expires_at) VALUES (1,'original.png','CAT',DATE_ADD(NOW(6), INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jars (jar_id,owner_id,name,theme,max_members,open_at) VALUES (1,1,'테스트','SPRING',2,DATE_ADD(NOW(6), INTERVAL 1 DAY))");
            sql.executeUpdate("INSERT INTO jar_designs (jar_id,design_type,final_s3_key,body_style,slot_center_x,slot_center_y,slot_size_ratio) VALUES (1,'ORIGINAL','final.png','CAT',0.5,0.5,0.5)");
        }
        migrate("39");
        try(var connection=database.createConnection("");var sql=connection.createStatement()) {
            for(String table:new String[]{"jar_design_drafts","jar_designs"}) {
                try(var rows=sql.executeQuery("SELECT body_style,photo_x,photo_y,photo_width,photo_height FROM "+table)) {
                    assertThat(rows.next()).isTrue(); assertThat(rows.getString(1)).isEqualTo("CAT");
                    for(int col=2;col<=5;col++) assertThat(rows.getObject(col)).isNull();
                }
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE "+table+" SET photo_x=0.1")).isInstanceOf(SQLException.class);
            }
            // 미선택 상태에는 표시 배치를 저장하지 않는다. CHECK의 SQL NULL/UNKNOWN도 우회가 되지 않는다.
            assertThatThrownBy(() -> sql.executeUpdate("UPDATE jar_design_drafts SET photo_x=0,photo_y=0,photo_width=1,photo_height=1")).isInstanceOf(SQLException.class);
            sql.executeUpdate("UPDATE jar_design_drafts SET selected_design_type='ORIGINAL'");
            for(String table:new String[]{"jar_design_drafts","jar_designs"}) {
                assertThat(sql.executeUpdate("UPDATE "+table+" SET photo_x=0.1,photo_y=0.2,photo_width=0.7,photo_height=0.5")).isEqualTo(1);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE "+table+" SET photo_x=0.5,photo_width=0.7")).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE "+table+" SET body_style=NULL")).isInstanceOf(SQLException.class);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE "+table+" SET photo_width=0")).isInstanceOf(SQLException.class);
                assertThat(sql.executeUpdate("UPDATE "+table+" SET body_style=NULL,photo_x=NULL,photo_y=NULL,photo_width=NULL,photo_height=NULL")).isEqualTo(1);
            }
            assertThat(sql.executeUpdate("UPDATE jar_design_drafts SET original_x=0,original_y=0.25,original_width=1,original_height=0.5")).isEqualTo(1);
            assertThatThrownBy(() -> sql.executeUpdate("UPDATE jar_design_drafts SET original_height=NULL")).isInstanceOf(SQLException.class);
        }
    }
    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(),database.getUsername(),database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }
}
