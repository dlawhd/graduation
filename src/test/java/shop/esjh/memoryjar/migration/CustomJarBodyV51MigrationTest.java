package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.*;

/** V50→V51에서 기존 외형을 그대로 보존하고 틀 없는 CUSTOM/손상된 JSON을 DB에서도 막는지 검증한다. */
@Testcontainers
class CustomJarBodyV51MigrationTest {
    @Container static final MariaDBContainer<?> database=new MariaDBContainer<>("mariadb:10.11").withDatabaseName("custom_body_upgrade").withUsername("test").withPassword("test");
    private void migrate(String version) { Flyway.configure().dataSource(database.getJdbcUrl(),database.getUsername(),database.getPassword()).locations("classpath:db/migration").target(version).load().migrate(); }
    private void sql(String value) throws Exception { try(var c=database.createConnection("");var s=c.createStatement()){s.execute(value);} }
    @Test void oldDataSurvivesAndCustomBodyRequiresBoundedJson() throws Exception {
        migrate("50");
        sql("INSERT INTO users(id,name,email,provider,provider_id) VALUES(1,'시험','body-v51@example.test','NAVER','body-v51')");
        sql("INSERT INTO jar_design_drafts(owner_id,original_s3_key,body_style,expires_at) VALUES(1,'old','STAR',DATE_ADD(NOW(),INTERVAL 1 DAY)),(1,'image-only',NULL,DATE_ADD(NOW(),INTERVAL 1 DAY))");
        sql("INSERT INTO jars(jar_id,owner_id,name,theme,max_members,open_at) VALUES(1,1,'기존','SPRING',2,DATE_ADD(NOW(),INTERVAL 1 DAY))");
        sql("INSERT INTO jar_designs(jar_id,design_type,final_s3_key,body_style,slot_center_x,slot_center_y,slot_size_ratio) VALUES(1,'ORIGINAL','old-final','STAR',0.5,0.3,0.2)");
        migrate("51");
        try(var c=database.createConnection("");var s=c.createStatement();var r=s.executeQuery("SELECT body_style,custom_body_json FROM jar_design_drafts WHERE original_s3_key='old'")){assertThat(r.next()).isTrue();assertThat(r.getString(1)).isEqualTo("STAR");assertThat(r.getString(2)).isNull();}
        for(String table:new String[]{"jar_design_drafts","jar_designs"}) {
            assertThatThrownBy(()->sql("UPDATE "+table+" SET body_style='CUSTOM'")).isInstanceOf(Exception.class);
            assertThatThrownBy(()->sql("UPDATE "+table+" SET custom_body_json='broken'")).isInstanceOf(Exception.class);
            sql("UPDATE "+table+" SET body_style='CUSTOM',custom_body_json='{\"points\":[{\"x\":0.1,\"y\":0.1},{\"x\":0.9,\"y\":0.1},{\"x\":0.5,\"y\":0.9}],\"color\":\"#abcdef\"}'");
            sql("UPDATE "+table+" SET body_style='CAT'");
            assertThatThrownBy(()->sql("UPDATE "+table+" SET body_style='UNKNOWN'")).isInstanceOf(Exception.class);
        }
    }
}
