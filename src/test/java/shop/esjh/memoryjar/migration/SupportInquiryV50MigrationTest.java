package shop.esjh.memoryjar.migration;

import org.junit.jupiter.api.Test;
import org.flywaydb.core.Flyway;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.*;

/** 실제 MariaDB에서 V49 알림을 보존하고 V50의 운영자 접수 알림 제약만 확장하는지 확인한다. */
@Testcontainers
class SupportInquiryV50MigrationTest {
    @Container static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("support_notification_upgrade_test").withUsername("test").withPassword("test");

    void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }

    void sql(String command) throws Exception {
        try (var connection = database.createConnection(""); var statement = connection.createStatement()) {
            statement.execute(command);
        }
    }

    @Test void upgradePreservesAllExistingTypesAndAllowsOnlyNewOperatorType() throws Exception {
        migrate("49");
        sql("INSERT INTO users(id,name,email,provider,provider_id) VALUES(1,'시험','support-v50@example.test','NAVER','support-v50')");
        for (String type : java.util.List.of("NOTE_COMMENTED", "COMMENT_REPLIED", "NOTE_REACTED", "JAR_MEMBER_JOINED", "SUPPORT_REPLIED")) {
            sql("INSERT INTO notifications(user_id,type,payload_json) VALUES(1,'" + type + "','{\"inquiryId\":1}')");
        }
        String newNotification = "INSERT INTO notifications(user_id,type,payload_json) VALUES(1,'SUPPORT_INQUIRY_RECEIVED','{\"inquiryId\":1}')";
        assertThatThrownBy(() -> sql(newNotification)).isInstanceOf(Exception.class);
        migrate("50");
        sql(newNotification);
        assertThatThrownBy(() -> sql("INSERT INTO notifications(user_id,type,payload_json) VALUES(1,'UNKNOWN','{}')")).isInstanceOf(Exception.class);
        try (var connection = database.createConnection(""); var statement = connection.createStatement();
             var result = statement.executeQuery("SELECT COUNT(*), COUNT(DISTINCT type) FROM notifications")) {
            assertThat(result.next()).isTrue();
            assertThat(result.getInt(1)).isEqualTo(6);
            assertThat(result.getInt(2)).isEqualTo(6);
        }
    }
}
