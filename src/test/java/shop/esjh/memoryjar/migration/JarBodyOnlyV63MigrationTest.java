package shop.esjh.memoryjar.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** V63이 기존 사진 디자인과 새 본체 단독 디자인을 같은 MariaDB에서 보존하는지 검사한다. */
@Testcontainers
class JarBodyOnlyV63MigrationTest {
    @Container
    static final MariaDBContainer<?> database = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("jar_body_v63").withUsername("test").withPassword("test");

    @Test
    void upgradesExistingDesignsAndEnforcesTheBodyOnlyContract() throws SQLException {
        migrate("62");
        execute("INSERT INTO users(id,name,email) VALUES(1,'시험','body-only-v63@example.invalid')");
        execute("""
            INSERT INTO jar_design_drafts(draft_id,owner_id,original_s3_key,body_style,expires_at)
            VALUES(1,1,'kept-original.png','CAT',DATE_ADD(NOW(),INTERVAL 1 DAY))
            """);
        execute("""
            INSERT INTO jars(jar_id,owner_id,name,theme,max_members,open_at) VALUES
            (1,1,'기존','SPRING',2,DATE_ADD(NOW(),INTERVAL 1 DAY)),
            (2,1,'모양','SPRING',2,DATE_ADD(NOW(),INTERVAL 1 DAY))
            """);
        execute("""
            INSERT INTO jar_designs(jar_id,design_type,final_s3_key,body_style,slot_center_x,slot_center_y,slot_size_ratio)
            VALUES(1,'ORIGINAL','kept-final.png','CAT',0.5,0.3,0.2)
            """);

        migrate("63");
        execute("""
            INSERT INTO jar_design_drafts(draft_id,owner_id,selected_design_type,body_style,expires_at)
            VALUES(2,1,'BODY_ONLY','FROG',DATE_ADD(NOW(),INTERVAL 1 DAY))
            """);
        execute("""
            INSERT INTO jar_designs(jar_id,design_type,body_style,slot_center_x,slot_center_y,slot_size_ratio)
            VALUES(2,'BODY_ONLY','FROG',0.5,0.3,0.2)
            """);
        execute("""
            UPDATE jar_design_drafts SET status='FINALIZED',finalized_jar_id=2,slot_center_x=0.5,
                slot_center_y=0.3,slot_size_ratio=0.2 WHERE draft_id=2
            """);

        try (var connection = database.createConnection("");
             var statement = connection.createStatement();
             var rows = statement.executeQuery("SELECT final_s3_key,body_style FROM jar_designs ORDER BY jar_id")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("kept-final.png");
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isNull();
            assertThat(rows.getString(2)).isEqualTo("FROG");
        }

        assertThatThrownBy(() -> execute("UPDATE jar_designs SET body_style=NULL WHERE jar_id=2"))
                .isInstanceOf(SQLException.class);
        assertThatThrownBy(() -> execute("UPDATE jar_designs SET final_s3_key=NULL WHERE jar_id=1"))
                .isInstanceOf(SQLException.class);
        assertThatThrownBy(() -> execute("UPDATE jar_design_drafts SET original_s3_key=NULL WHERE draft_id=1"))
                .isInstanceOf(SQLException.class);
    }

    private void migrate(String version) {
        Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                .locations("classpath:db/migration").target(version).load().migrate();
    }

    private void execute(String sql) throws SQLException {
        try (var connection = database.createConnection(""); var statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }
}
