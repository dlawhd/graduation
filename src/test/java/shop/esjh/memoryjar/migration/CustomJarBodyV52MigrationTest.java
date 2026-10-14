package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.*;

/** V51의 기존 단색 틀을 유지하고 V52의 별도 테두리 키와 확장 JSON 제약을 실제 MariaDB에서 검증한다. */
@Testcontainers
class CustomJarBodyV52MigrationTest {
    @Container static final MariaDBContainer<?> database=new MariaDBContainer<>("mariadb:10.11")
        .withDatabaseName("custom_body_v52").withUsername("test").withPassword("test");
    private void migrate(String version) {Flyway.configure().dataSource(database.getJdbcUrl(),database.getUsername(),database.getPassword())
        .locations("classpath:db/migration").target(version).load().migrate();}
    private void sql(String value) throws Exception {try(var c=database.createConnection("");var s=c.createStatement()){s.execute(value);}}
    @Test void upgradePreservesOldDataAndRejectsArtworkWithoutShape() throws Exception {
        migrate("51");
        sql("INSERT INTO users(id,name,email,provider,provider_id) VALUES(1,'시험','body-v52@example.test','NAVER','body-v52')");
        sql("INSERT INTO jar_design_drafts(owner_id,original_s3_key,body_style,expires_at) VALUES(1,'old','CAT',DATE_ADD(NOW(),INTERVAL 1 DAY))");
        sql("INSERT INTO jars(jar_id,owner_id,name,theme,max_members,open_at) VALUES(1,1,'기존','SPRING',2,DATE_ADD(NOW(),INTERVAL 1 DAY))");
        sql("INSERT INTO jar_designs(jar_id,design_type,final_s3_key,body_style,slot_center_x,slot_center_y,slot_size_ratio) VALUES(1,'ORIGINAL','old-final','CAT',0.5,0.3,0.2)");
        migrate("52");
        for(String table:new String[]{"jar_design_drafts","jar_designs"}) {
            try(var c=database.createConnection("");var s=c.createStatement();var r=s.executeQuery("SELECT body_style,body_artwork_s3_key FROM "+table)) {
                assertThat(r.next()).isTrue();assertThat(r.getString(1)).isEqualTo("CAT");assertThat(r.getString(2)).isNull();
            }
            assertThatThrownBy(()->sql("UPDATE "+table+" SET body_artwork_s3_key='border.png'")).isInstanceOf(Exception.class);
            sql("UPDATE "+table+" SET body_style='CUSTOM',custom_body_json='{\"points\":[{\"x\":0.1,\"y\":0.1},{\"x\":0.9,\"y\":0.1},{\"x\":0.5,\"y\":0.9}],\"color\":\"#abcdef\"}',body_artwork_s3_key='border.png'");
            assertThatThrownBy(()->sql("UPDATE "+table+" SET custom_body_json='broken'")).isInstanceOf(Exception.class);
        }
        // Draft는 이미지 단독으로 돌아가도 저장한 테두리를 나중에 정리해야 한다.
        sql("UPDATE jar_design_drafts SET body_style=NULL");
        assertThatThrownBy(()->sql("UPDATE jar_designs SET body_style='CAT'")).isInstanceOf(Exception.class);
        assertThatThrownBy(()->sql("UPDATE jar_designs SET body_style=NULL")).isInstanceOf(Exception.class);
    }
}
