package shop.esjh.memoryjar.isolated;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BiFunction;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserLocalCredential;
import shop.esjh.memoryjar.entity.jar.*;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.enums.jar.*;
import static org.assertj.core.api.Assertions.assertThat;

/** 빈 격리 시험 DB에 1만 계정을 만들고, 조회 시험 뒤 해당 실행의 데이터가 모두 삭제됐는지 확인한다. */
final class IsolatedDataset10kScenario {
    private final EntityManager em;
    private final TransactionTemplate tx;
    private final PasswordEncoder passwords;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    IsolatedDataset10kScenario(EntityManager em, PlatformTransactionManager transactions,
                              PasswordEncoder passwords, JdbcTemplate jdbc, ObjectMapper json) {
        this.em = em; this.tx = new TransactionTemplate(transactions);
        this.passwords = passwords; this.jdbc = jdbc; this.json = json;
    }

    /** 호출자의 JDBC 목적지 검사 후에도 빈 DB를 확인한다. 실패·시간 초과에도 생성한 실행 범위만 정리한다. */
    void run(BiFunction<String, Integer, Map<String, Object>> createActiveFixture, int activeAccounts) throws Exception {
        assertThat(activeAccounts).isIn(10, 1000);
        boolean concurrent = activeAccounts == 1000;
        var empty = tableCounts();
        assertThat(empty.values()).allMatch(count -> count == 0L);
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("scope", concurrent ? "LOCAL_1000_DISTINCT_CONCURRENT_USERS" : "LOCAL_10000_STORED_USERS_NOT_10000_CONCURRENT");
        report.put("before", empty);
        String run = null;
        try {
            var anonymous = HttpClient.newHttpClient().send(HttpRequest.newBuilder(
                    URI.create("http://127.0.0.1:8080/api/v1/jars")).GET().build(), HttpResponse.BodyHandlers.discarding());
            assertThat(anonymous.statusCode()).isEqualTo(401);
            report.put("unauthenticatedStatus", anonymous.statusCode());
            run = "lt" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
            assertThat(run).matches("lt[a-f0-9]{8}");
            String prefix = run;
            var groups = new ArrayList<Map<String, Object>>();
            for (int offset = 0; offset < activeAccounts; offset += 10) {
                int groupOffset = offset;
                groups.add(tx.execute(status -> createActiveFixture.apply(prefix, groupOffset)));
                em.clear();
            }
            tx.executeWithoutResult(status -> populateBackground(prefix, activeAccounts));
            int background = 10000 - activeAccounts;
            int expectedJars = background + groups.size() * 3;
            int expectedNotes = background + groups.size() * 120;
            var populated = tableCounts();
            assertThat(populated).containsEntry("users", 10000L).containsEntry("user_local_credentials", 10000L)
                    .containsEntry("jars", (long) expectedJars).containsEntry("jar_members", (long) background + activeAccounts * 3L)
                    .containsEntry("notes", (long) expectedNotes).containsEntry("jar_open_events", (long) expectedJars);
            report.put("populated", populated);
            report.put("activeLoginAccounts", activeAccounts);
            report.put("backgroundAccounts", background);
            report.put("backgroundHashPreparation", "one random shared test password hash; not background registration or login measurements");
            // 기존 10명 단위 응답 계약을 유지한다. 1000명 모드도 묶음마다 독립된 계정과 저금통을 사용한다.
            Map<String, Object> manifest = concurrent ? new LinkedHashMap<>(Map.of(
                    "schema", 2, "scope", "isolated-local-1000", "runId", run, "groups", groups))
                    : new LinkedHashMap<>(groups.get(0));
            Long forbiddenJar = jdbc.queryForObject("SELECT jar_id FROM jars WHERE name=?", Long.class, run + "-background-" + activeAccounts);
            manifest.put("dataset", Map.of("storedUsers", 10000, "activeAccounts", activeAccounts,
                    "backgroundAccounts", background, "jars", expectedJars, "notes", expectedNotes, "forbiddenJarId", forbiddenJar));
            Files.writeString(Path.of("/results/read-fixture.json"), json.writeValueAsString(manifest));
            Files.writeString(Path.of("/results/read-ready"), "LOCAL_10000_READY\n");
            Path completed = Path.of("/results/read-completed.json");
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(concurrent ? 1200 : 300);
            while (!Files.exists(completed)) {
                if (System.nanoTime() > deadline) throw new AssertionError("Local dataset load deadline exceeded");
                Thread.sleep(200);
            }
            int loadExit = json.readTree(Files.readString(completed)).path("exitCode").asInt(-1);
            report.put("loadExitCode", loadExit);
            var afterRead = tableCounts();
            report.put("afterRead", afterRead);
            assertThat(afterRead.get("refresh_tokens")).isEqualTo((long) activeAccounts);
            var expectedBusiness = new LinkedHashMap<>(populated);
            var actualBusiness = new LinkedHashMap<>(afterRead);
            expectedBusiness.remove("refresh_tokens"); actualBusiness.remove("refresh_tokens");
            assertThat(actualBusiness).isEqualTo(expectedBusiness);
            report.put("businessRowsUnchangedDuringRead", true);
            assertThat(loadExit).isZero();
        } finally {
            if (run != null) {
                String prefix = run;
                tx.executeWithoutResult(status -> deleteRun(prefix));
            }
            var after = tableCounts();
            report.put("afterDelete", after);
            report.put("allApplicationTablesRestored", after.equals(empty));
            Files.writeString(Path.of("/results/dataset-verification.json"), json.writeValueAsString(report));
            assertThat(after).isEqualTo(empty);
        }
    }

    /** 실제 로그인 계정을 제외한 배경 계정에 각각 저금통·멤버·오픈 기록·쪽지를 넣는다. 해싱은 준비와 분리한다. */
    private void populateBackground(String run, int activeAccounts) {
        // 격리 DB의 배경 계정만 공유하는 난수 암호다. 실제 로그인 시험 계정은 각자 다른 난수 암호를 사용한다.
        String hash = passwords.encode("Dataset!" + UUID.randomUUID());
        var openAt = LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusDays(1);
        for (int i = activeAccounts; i < 10000; i++) {
            String login = run + String.format("%05d", i);
            var user = User.builder().email(login + "@example.invalid").name("배경시험" + i).build();
            em.persist(user);
            em.persist(UserLocalCredential.builder().user(user).loginId(login).passwordHash(hash).build());
            var jar = Jar.builder().owner(user).name(run + "-background-" + i)
                    .description("로컬 규모 시험").theme(JarTheme.SPRING).maxMembers(10)
                    .openAt(openAt).openMode(JarOpenMode.ALL_AT_ONCE).lockLevel(JarLockLevel.TITLE_ONLY).build();
            em.persist(jar); em.persist(JarMember.createOwner(jar, user));
            em.persist(JarOpenEvent.create(jar, openAt, JarOpenReason.SCHEDULED));
            em.persist(Note.builder().jar(jar).author(user).title(run + "-background-note-" + i)
                    .content("실제 사용자 내용이 아닌 로컬 규모 시험 본문입니다.")
                    .noteDate(LocalDate.now()).isEncrypted(false).build());
            if (i % 100 == 99) { em.flush(); em.clear(); }
        }
        em.flush(); em.clear();
    }

    /** 외래 키를 유지하고 자식부터 지운다. 검증된 난수 실행 접두사와 가짜 이메일 범위만 삭제한다. */
    private void deleteRun(String run) {
        if (!run.matches("lt[a-f0-9]{8}")) throw new IllegalArgumentException("Invalid dataset run");
        String email = run + "%@example.invalid";
        jdbc.update("DELETE n FROM notes n JOIN jars j ON j.jar_id=n.jar_id JOIN users u ON u.id=j.owner_id WHERE u.email LIKE ?", email);
        jdbc.update("DELETE e FROM jar_open_events e JOIN jars j ON j.jar_id=e.jar_id JOIN users u ON u.id=j.owner_id WHERE u.email LIKE ?", email);
        jdbc.update("DELETE m FROM jar_members m JOIN users u ON u.id=m.user_id WHERE u.email LIKE ?", email);
        jdbc.update("DELETE j FROM jars j JOIN users u ON u.id=j.owner_id WHERE u.email LIKE ?", email);
        jdbc.update("DELETE t FROM refresh_tokens t JOIN users u ON u.id=t.user_id WHERE u.email LIKE ?", email);
        jdbc.update("DELETE c FROM user_local_credentials c JOIN users u ON u.id=c.user_id WHERE u.email LIKE ?", email);
        jdbc.update("DELETE FROM users WHERE email LIKE ?", email);
    }

    /** Flyway 이력을 제외한 전체 앱 테이블을 확인해 정리 누락을 숨기지 않는다. */
    private Map<String, Long> tableCounts() {
        var counts = new LinkedHashMap<String, Long>();
        var names = jdbc.queryForList("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME<>'flyway_schema_history' ORDER BY TABLE_NAME", String.class);
        for (String name : names) {
            if (!name.matches("[a-z][a-z0-9_]*")) throw new IllegalStateException("Unexpected table identifier");
            counts.put(name, jdbc.queryForObject("SELECT COUNT(*) FROM `" + name + "`", Long.class));
        }
        return counts;
    }
}
