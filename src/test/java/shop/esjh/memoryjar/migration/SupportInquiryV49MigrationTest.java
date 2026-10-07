package shop.esjh.memoryjar.migration;

import org.junit.jupiter.api.Test;
import org.flywaydb.core.Flyway;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.*;
import static org.assertj.core.api.Assertions.*;

/** V48 운영 구조를 V49로 올리며 기존 알림 보존과 문의/알림 제약을 실제 MariaDB에서 확인한다. */
@Testcontainers
class SupportInquiryV49MigrationTest {
    @Container static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("support_upgrade_test").withUsername("test").withPassword("test");
    void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }
    void sql(String command) throws Exception {
        try (var connection = database.createConnection(""); var statement = connection.createStatement()) { statement.execute(command); }
    }
    @Test void upgradePreservesExistingNotificationAndAllowsSupportOnlyAfterV49() throws Exception {
        migrate("48");
        sql("INSERT INTO users(id,name,email,provider,provider_id) VALUES(1,'시험','support@example.test','NAVER','support')");
        sql("INSERT INTO notifications(user_id,type,payload_json) VALUES(1,'NOTE_COMMENTED','{\"noteId\":11}')");
        assertThatThrownBy(() -> sql("INSERT INTO notifications(user_id,type,payload_json) VALUES(1,'SUPPORT_REPLIED','{\"inquiryId\":1}')")).isInstanceOf(Exception.class);
        migrate("49");
        sql("INSERT INTO notifications(user_id,type,payload_json) VALUES(1,'SUPPORT_REPLIED','{\"inquiryId\":1}')");
        assertThatThrownBy(() -> sql("INSERT INTO notifications(user_id,type,payload_json) VALUES(1,'UNKNOWN','{}')")).isInstanceOf(Exception.class);
        try (var connection = database.createConnection(""); var statement = connection.createStatement();
             var result = statement.executeQuery("SELECT COUNT(*) FROM notifications")) {
            assertThat(result.next()).isTrue(); assertThat(result.getInt(1)).isEqualTo(2);
        }
        sql("INSERT INTO jar_design_drafts(draft_id,owner_id,original_s3_key,expires_at) VALUES(1,1,'fixture/original.png',DATE_ADD(NOW(),INTERVAL 1 DAY))");
        sql("INSERT INTO jar_ai_generations(generation_id,draft_id,ai_style,status,ai_provider,ai_model,prompt_version,error_code,completed_at) VALUES(1,1,'CUTE_2D','FAILED','CLOUDFLARE','fixture','fixture','PROVIDER_REQUEST_FAILED',NOW(6))");
        String insert = "INSERT INTO support_inquiries(owner_id,generation_id,draft_id,style,error_code,model,prompt_version,failed_at,description,status,image_s3_key,image_expires_at,content_expires_at,sharing_agreed_at,created_at,updated_at) VALUES(1,1,1,'CUTE_2D','PROVIDER_REQUEST_FAILED','fixture','fixture',NOW(),'문의','OPEN','fixture/support.png',DATE_ADD(NOW(),INTERVAL 30 DAY),DATE_ADD(NOW(),INTERVAL 90 DAY),NOW(),NOW(),NOW())";
        sql(insert);
        assertThatThrownBy(() -> sql(insert)).isInstanceOf(Exception.class);
        assertThatThrownBy(() -> sql("UPDATE support_inquiries SET status='OTHER' WHERE generation_id=1")).isInstanceOf(Exception.class);
        assertThatThrownBy(() -> sql("UPDATE support_inquiries SET status='ANSWERED' WHERE generation_id=1")).isInstanceOf(Exception.class);
    }
}
