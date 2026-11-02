package shop.esjh.memoryjar.migration;

import org.junit.jupiter.api.Test;
import org.flywaydb.core.Flyway;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.*;
import static org.assertj.core.api.Assertions.*;

/** V55에서 보관하던 AI 문의와 답변이 V56의 추가 대화로 안전하게 이어지는지 실제 DB로 확인한다. */
@Testcontainers
class SupportConversationV56MigrationTest {
    @Container static final MariaDBContainer<?> database=new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("support_v56_upgrade").withUsername("test").withPassword("test");
    void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(),database.getUsername(),database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }
    void sql(String command) throws Exception {
        try(var connection=database.createConnection("");var statement=connection.createStatement()){statement.execute(command);}
    }
    @Test void historicalAnswerBecomesOneMessageAndNewGeneralRowsNeedNoAiFields() throws Exception {
        migrate("55");
        sql("INSERT INTO users(id,name,email) VALUES(1,'시험','support-upgrade@example.invalid')");
        sql("INSERT INTO jar_design_drafts(draft_id,owner_id,original_s3_key,expires_at) VALUES(1,1,'fixture/original.png',DATE_ADD(NOW(),INTERVAL 1 DAY))");
        sql("INSERT INTO jar_ai_generations(generation_id,draft_id,ai_style,status,ai_provider,ai_model,prompt_version,error_code,completed_at) VALUES(1,1,'CUTE_2D','FAILED','CLOUDFLARE','fixture','fixture','PROVIDER_REQUEST_FAILED',NOW(6))");
        sql("INSERT INTO support_inquiries(owner_id,generation_id,draft_id,style,error_code,model,prompt_version,failed_at,description,reply,status,image_s3_key,image_expires_at,content_expires_at,sharing_agreed_at,replied_at,created_at,updated_at) VALUES(1,1,1,'CUTE_2D','PROVIDER_REQUEST_FAILED','fixture','fixture',NOW(),'기존 문의','기존 답변','ANSWERED','fixture/support.png',DATE_ADD(NOW(),INTERVAL 30 DAY),DATE_ADD(NOW(),INTERVAL 90 DAY),NOW(),NOW(),NOW(),NOW())");
        migrate("56");
        try(var connection=database.createConnection("");var statement=connection.createStatement();var rows=statement.executeQuery(
                "SELECT i.category,i.reply,m.content,m.author_role,i.last_submitted_at FROM support_inquiries i JOIN support_messages m ON m.inquiry_id=i.inquiry_id")) {
            assertThat(rows.next()).isTrue();assertThat(rows.getString(1)).isEqualTo("AI_GENERATION");
            assertThat(rows.getString(2)).isEqualTo("기존 답변");assertThat(rows.getString(3)).isEqualTo("기존 답변");assertThat(rows.getString(4)).isEqualTo("OPERATOR");
            assertThat(rows.getTimestamp(5)).isNotNull();assertThat(rows.next()).isFalse();
        }
        sql("UPDATE support_inquiries SET status='WAITING_USER' WHERE inquiry_id=1");
        String general="INSERT INTO support_inquiries(owner_id,category,title,description,status,content_expires_at,created_at,updated_at,last_submitted_at) VALUES(1,'USAGE','사용 문의','문의','OPEN',DATE_ADD(NOW(),INTERVAL 90 DAY),NOW(),NOW(),NOW())";
        sql(general);
        assertThatThrownBy(()->sql("UPDATE support_inquiries SET owner_id=NULL WHERE inquiry_id=2")).isInstanceOf(Exception.class);
        assertThatThrownBy(()->sql("UPDATE support_inquiries SET status='UNKNOWN' WHERE inquiry_id=2")).isInstanceOf(Exception.class);
        sql("INSERT INTO notifications(user_id,type,payload_json) VALUES(1,'SUPPORT_FOLLOWED_UP','{\"inquiryId\":1}')");
        migrate("56");
    }
}
