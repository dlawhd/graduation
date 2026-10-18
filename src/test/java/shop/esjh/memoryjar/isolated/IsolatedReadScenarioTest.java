package shop.esjh.memoryjar.isolated;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import shop.esjh.memoryjar.MemoryJarApplication;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserLocalCredential;
import shop.esjh.memoryjar.entity.jar.*;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.enums.jar.*;
import shop.esjh.memoryjar.service.ai.AiDraftCleanupScheduler;
import shop.esjh.memoryjar.service.ai.CloudflareWorkersAiClient;
import shop.esjh.memoryjar.service.jar.JarOpenScheduler;
import shop.esjh.memoryjar.service.support.SupportCleanupScheduler;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;

/** 임시 DB에만 시험 데이터를 만들고 호스트 k6의 실제 로그인·조회 결과를 검사한다. 운영 성능 시험이 아니다. */
@EnabledIfEnvironmentVariable(named = "ISOLATED_READ_PREFLIGHT", matches = "1")
@SpringBootTest(classes = MemoryJarApplication.class, webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT,
        properties = {"server.port=8080", "server.address=0.0.0.0", "spring.docker.compose.enabled=false",
                "management.server.port=9091", "management.server.address=127.0.0.1",
                "app.cookie.secure=false", "app.cookie.domain=", "app.cookie.same-site=Lax"})
class IsolatedReadScenarioTest {
    @PersistenceContext EntityManager em;
    @Autowired PlatformTransactionManager transactions;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired ObjectMapper json;
    @MockitoBean S3Client s3;
    @MockitoBean S3Presigner presigner;
    @MockitoBean RekognitionClient rekognition;
    @MockitoBean SesV2Client ses;
    @MockitoBean CloudflareWorkersAiClient cloudflare;
    @MockitoBean JarOpenScheduler jarScheduler;
    @MockitoBean AiDraftCleanupScheduler aiScheduler;
    @MockitoBean SupportCleanupScheduler supportScheduler;

    @Test void dedicatedFixtureAndRealReadScenarioAreLocalOnly() throws Exception {
        // 파일이나 데이터 생성 전에 실제 JDBC 목적지를 대조한다. 운영 주소가 섞이면 즉시 실패한다.
        try (var connection = dataSource.getConnection()) {
            URI target = URI.create(connection.getMetaData().getURL().substring("jdbc:".length()).split("\\?", 2)[0]);
            // 드라이버가 기본 포트 3306을 생략하는 표기만 허용한다. 다른 DB·호스트는 거절한다.
            assertThat("mariadb".equals(target.getScheme()) && "db".equals(target.getHost())
                    && (target.getPort() == -1 || target.getPort() == 3306)
                    && "/isolated_e2e".equals(target.getPath()) && target.getUserInfo() == null).isTrue();
        }
        var fixture = new TransactionTemplate(transactions).execute(status -> createFixture());
        var before = businessCounts();
        assertThat(before).containsEntry("users", 10L).containsEntry("jars", 3L)
                .containsEntry("jar_members", 30L).containsEntry("notes", 120L)
                .containsEntry("jar_open_events", 3L).containsEntry("chat_messages", 0L);
        // 토큰 없이 일반 조회를 허용하는 시험 서버로 바뀌지 않았는지도 검사한다.
        var response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(
                URI.create("http://127.0.0.1:8080/api/v1/jars")).GET().build(), HttpResponse.BodyHandlers.discarding());
        assertThat(response.statusCode()).isEqualTo(401);
        Path manifest = Path.of("/results/read-fixture.json");
        Files.writeString(manifest, json.writeValueAsString(fixture));
        // 원자적 ready 표시는 암호가 든 manifest 쓰기가 끝난 뒤 별도 파일로 남긴다.
        Files.writeString(Path.of("/results/read-ready"), "LOCAL_FIXTURE_READY\n");
        Path completed = Path.of("/results/read-completed.json");
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(150);
        while (!Files.exists(completed)) {
            if (System.nanoTime() > deadline) throw new AssertionError("Local k6 completion deadline exceeded");
            Thread.sleep(200);
        }
        assertThat(json.readTree(Files.readString(completed)).path("exitCode").asInt(-1)).isZero();
        assertThat(businessCounts()).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from refresh_tokens", Long.class)).isEqualTo(10L);
        verifyNoInteractions(s3, presigner, rekognition, ses, cloudflare);
        // 인증정보는 보고서에 넣지 않고 형태·개수와 외부 호출 경계만 기록한다.
        Files.writeString(Path.of("/results/read-verification.json"), json.writeValueAsString(Map.of(
                "scope", "LOCAL_FUNCTIONAL_ONLY_NOT_EC2_BASELINE", "accounts", 10, "jars", 3,
                "notes", 120, "businessRowsUnchanged", true, "externalProviderCalls", 0,
                "loginRefreshTokensCreated", 10)));
    }

    /** 기존 Entity와 PasswordEncoder를 재사용해 가짜 개인정보와 고유 난수 비밀번호로만 생성한다. */
    private Map<String, Object> createFixture() {
        String run = "lt" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        List<User> users = new ArrayList<>();
        List<Map<String, Object>> accounts = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            String login = run + String.format("%02d", i);
            String password = "Lt!7" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            User user = User.builder().email(login + "@example.invalid").name("시험친구" + i).build();
            em.persist(user);
            em.persist(UserLocalCredential.builder().user(user).loginId(login)
                    .passwordHash(passwords.encode(password)).build());
            users.add(user);
            accounts.add(Map.of("userId", user.getId(), "loginId", login, "password", password));
        }
        List<Map<String, Object>> jars = new ArrayList<>();
        LocalDateTime openAt = LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusDays(1);
        for (int j = 0; j < 3; j++) {
            Jar jar = Jar.builder().owner(users.get(j)).name(run + "-jar-" + j)
                    .description("전용 텍스트 조회 기능 검증").theme(JarTheme.SPRING).maxMembers(10)
                    .openAt(openAt).openMode(JarOpenMode.ALL_AT_ONCE).lockLevel(JarLockLevel.TITLE_ONLY).build();
            em.persist(jar);
            for (User user : users) em.persist(user == users.get(j)
                    ? JarMember.createOwner(jar, user) : JarMember.createMember(jar, user));
            // 조회 중 보정 오픈·SYSTEM 채팅 저장이 섞이지 않도록 오픈 기록까지 준비한다.
            em.persist(JarOpenEvent.create(jar, openAt, JarOpenReason.SCHEDULED));
            for (int n = 0; n < 40; n++) {
                em.persist(Note.builder().jar(jar).author(users.get(n % users.size()))
                        .title(run + "-note-" + n).content("실제 사용자 내용이 아닌 시험용 본문입니다. ".repeat(20))
                        .noteDate(LocalDate.now()).location("가상 장소").tags(List.of("시험"))
                        .isEncrypted(false).build());
            }
            em.flush();
            List<Long> noteIds = jdbc.queryForList(
                    "select note_id from notes where jar_id=? order by created_at desc, note_id desc", Long.class, jar.getJarId());
            jars.add(Map.of("jarId", jar.getJarId(), "name", jar.getName(), "ownerId", users.get(j).getId(), "noteIds", noteIds));
        }
        return Map.of("schema", 1, "scope", "isolated-local", "runId", run,
                "accounts", accounts, "jars", jars, "pageSize", 20, "notesPerJar", 40);
    }

    private Map<String, Long> businessCounts() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String table : List.of("users", "user_local_credentials", "jars", "jar_members", "notes",
                "jar_open_events", "chat_messages", "note_attachments", "jar_designs", "notifications")) {
            // 테이블명은 사용자 입력이 아닌 고정된 허용 목록이다.
            counts.put(table, jdbc.queryForObject("select count(*) from " + table, Long.class));
        }
        return counts;
    }
}
