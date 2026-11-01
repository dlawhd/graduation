package shop.esjh.memoryjar.compat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import shop.esjh.memoryjar.MemoryJarApplication;
import shop.esjh.memoryjar.dto.ai.CustomJarBodyValue;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserLocalCredential;
import shop.esjh.memoryjar.entity.ai.CustomJarBodyConverter;
import shop.esjh.memoryjar.entity.ai.JarDesign;
import shop.esjh.memoryjar.entity.ai.JarPhotoFrame;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.jar.JarMember;
import shop.esjh.memoryjar.entity.jar.JarOpenEvent;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.enums.ai.JarDesignType;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import shop.esjh.memoryjar.enums.jar.JarOpenReason;
import shop.esjh.memoryjar.service.ai.AiDraftCleanupScheduler;
import shop.esjh.memoryjar.service.ai.CloudflareWorkersAiClient;
import shop.esjh.memoryjar.service.jar.JarOpenScheduler;
import shop.esjh.memoryjar.service.support.SupportCleanupScheduler;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 옛 앱 전체를 실제 HTTP·로그인·MariaDB와 연결한다. 외부 제공자와 자동 정리만 시험 대역이다. */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@SpringBootTest(classes = MemoryJarApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.address=127.0.0.1", "spring.docker.compose.enabled=false",
                "spring.jpa.show-sql=false", "spring.profiles.active=test", "logging.level.root=WARN",
                "app.cookie.secure=false", "app.cookie.domain=", "app.cookie.same-site=Lax"})
class LegacyBackendCompatibilityTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired PlatformTransactionManager transactions;
    @PersistenceContext EntityManager em;
    @MockitoBean S3Client s3;
    @MockitoBean S3Presigner presigner;
    @MockitoBean RekognitionClient rekognition;
    @MockitoBean SesV2Client ses;
    @MockitoBean CloudflareWorkersAiClient cloudflare;
    @MockitoBean JarOpenScheduler jarScheduler;
    @MockitoBean AiDraftCleanupScheduler aiScheduler;
    @MockitoBean SupportCleanupScheduler supportScheduler;
    private JsonNode fixture;
    private String ownerLogin, outsiderLogin, password;
    private long ownerId;

    /** 실제 회원정보 대신 무작위 시험 계정과 승인된 표시 필드만 임시 DB에 넣는다. */
    @BeforeAll void prepareFixture() throws Exception {
        fixture = json.readTree(Files.readString(Path.of("/fixture/fixture-private.json")));
        require(fixture.path("sourceJarId").asLong() == 112, "Unexpected fixture target");
        require(!fixture.path("hasSelectedGeneration").asBoolean(), "AI generation fixture not supported by this scenario");
        require("ORIGINAL".equals(fixture.path("designType").asText()), "Original design fixture required");
        String run = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        ownerLogin = "lc" + run;
        outsiderLogin = "lo" + run;
        password = "Lc!7" + UUID.randomUUID().toString().replace("-", "");
        var body = json.treeToValue(fixture.path("customBody"), CustomJarBodyValue.class);
        var photo = json.treeToValue(fixture.path("photoFrame"), JarPhotoFrameValue.class);
        new TransactionTemplate(transactions).execute(status -> {
            User owner = User.builder().email(ownerLogin + "@example.invalid").name("호환시험주인").build();
            User outsider = User.builder().email(outsiderLogin + "@example.invalid").name("호환시험외부인").build();
            em.persist(owner); em.persist(outsider);
            em.persist(UserLocalCredential.builder().user(owner).loginId(ownerLogin).passwordHash(passwords.encode(password)).build());
            em.persist(UserLocalCredential.builder().user(outsider).loginId(outsiderLogin).passwordHash(passwords.encode(password)).build());
            em.flush(); ownerId = owner.getId();
            LocalDateTime openAt = fixture.path("isOpen").asBoolean() ? LocalDateTime.of(2020,1,1,0,0) : LocalDateTime.of(2099,1,1,0,0);
            jdbc.update("insert into jars(jar_id,owner_id,name,description,theme,max_members,open_at,open_mode,lock_level) values(112,?,?,?,?,?,?,?,?)",
                    ownerId, "옛 백엔드 호환 시험", "개인정보를 제거한 전용 시험", fixture.path("theme").asText(),
                    fixture.path("maxMembers").asInt(), java.sql.Timestamp.valueOf(openAt), fixture.path("openMode").asText(), fixture.path("lockLevel").asText());
            Jar jar = em.find(Jar.class, 112L);
            em.persist(JarMember.createOwner(jar, owner));
            if (fixture.path("isOpen").asBoolean()) em.persist(JarOpenEvent.create(jar, openAt, JarOpenReason.SCHEDULED));
            JsonNode slot = fixture.path("slot");
            em.persist(JarDesign.builder().jar(jar).designType(JarDesignType.ORIGINAL)
                    .finalS3Key("compatibility/fixture.png").bodyStyle(JarBodyStyle.CUSTOM).customBody(body)
                    .photoFrame(new JarPhotoFrame(photo)).slotStyle(JarSlotStyle.valueOf(slot.path("style").asText()))
                    .slotCenterX(slot.path("centerX").decimalValue()).slotCenterY(slot.path("centerY").decimalValue())
                    .slotSizeRatio(slot.path("sizeRatio").decimalValue()).build());
            em.flush();
            return null;
        });
    }

    /** 이미지 URL 발급의 형식만 대역으로 제공한다. 실제 AWS 서명·다운로드를 검증하지 않는다. */
    @BeforeEach void configureProviderBoundary() throws Exception {
        var signed = mock(PresignedGetObjectRequest.class);
        doReturn(new URL("https://compat.invalid/fixture.png")).when(signed).url();
        doReturn(signed).when(presigner).presignGetObject(any(GetObjectPresignRequest.class));
    }

    @AfterEach void noUnexpectedExternalProviderCalls() { verifyNoInteractions(s3, rekognition, ses, cloudflare); }

    @Test @Order(1) void startsOldApplicationAgainstRequestedRealSchema() {
        int expected = Integer.parseInt(System.getenv("COMPAT_SCHEMA_VERSION"));
        require(jdbc.queryForObject("select max(cast(version as unsigned)) from flyway_schema_history where success=1", Integer.class) == expected,
                "Unexpected migration history");
        require(jdbc.queryForObject("select count(*) from jar_designs where jar_id=112", Integer.class) == 1, "Fixture missing");
    }

    @Test @Order(2) void anonymousAndMissingCsrfAreRejected() throws Exception {
        Browser browser = new Browser();
        require(browser.get("/api/v1/jars/112").statusCode() == 401, "Anonymous read was not rejected");
        require(browser.post("/api/v1/auth/login", Map.of("loginId",ownerLogin,"password",password), false).statusCode() == 403, "Missing CSRF was not rejected");
    }

    @Test @Order(3) void wrongPasswordIsRejected() throws Exception {
        Browser browser = new Browser();
        require(browser.post("/api/v1/auth/login", Map.of("loginId",ownerLogin,"password",password+"wrong"), true).statusCode() == 401, "Wrong password status mismatch");
    }

    @Test @Order(4) void realLoginAndSameJarDesignReadSucceed() throws Exception {
        Browser owner = new Browser(); owner.login(ownerLogin);
        require(owner.get("/api/v1/me").statusCode() == 200, "Login session not accepted");
        require(owner.get("/api/v1/jars").statusCode() == 200, "Jar list failed");
        for (int i=0;i<2;i++) {
            var response = owner.get("/api/v1/jars/112");
            require(response.statusCode() == 200, "Same jar read failed");
            JsonNode data = json.readTree(response.body()).path("data");
            require(data.path("jarId").asLong() == 112, "Jar ID mismatch");
            JsonNode design = data.path("design");
            require("CUSTOM".equals(design.path("bodyStyle").asText()), "Body style mismatch");
            require(fixture.path("customBody").equals(design.path("customBody")), "Stored outline changed");
            for (String field : List.of("x","y","width","height")) {
                require(fixture.path("photoFrame").path(field).decimalValue().compareTo(design.path("photoFrame").path(field).decimalValue()) == 0, "Photo placement changed");
            }
            require(fixture.path("photoFrame").path("fit").asText().equals(design.path("photoFrame").path("fit").asText()), "Photo fit changed");
            for (String field : List.of("centerX","centerY","sizeRatio")) {
                String responseField = "slot" + Character.toUpperCase(field.charAt(0)) + field.substring(1);
                require(fixture.path("slot").path(field).decimalValue().compareTo(design.path(responseField).decimalValue()) == 0, "Slot placement changed");
            }
            require(fixture.path("slot").path("style").asText().equals(design.path("slotStyle").asText()), "Slot style changed");
            require("https://compat.invalid/fixture.png".equals(design.path("imageUrl").asText()), "Preview URL missing");
        }
        require(owner.cookies.getCookieStore().getCookies().stream().anyMatch(c -> c.getName().equals("accessToken")), "Access cookie missing");
        require(jdbc.queryForObject("select count(*) from jar_designs", Integer.class) == 1, "Read changed design row count");
    }

    @Test @Order(5) void nonMemberAndMissingJarAreRejected() throws Exception {
        Browser outsider = new Browser(); outsider.login(outsiderLogin);
        require(outsider.get("/api/v1/jars/112").statusCode() == 403, "Non-member read was not rejected");
        require(outsider.get("/api/v1/jars/999999").statusCode() == 404, "Missing jar status mismatch");
    }

    @Test @Order(6) void futureJsonAndEnumsRemainOutsideLegacyCompatibility() throws Exception {
        var expanded = fixture.path("customBody").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode)expanded).putArray("photoContours");
        boolean jsonRejected = false;
        try { new CustomJarBodyConverter().convertToEntityAttribute(json.writeValueAsString(expanded)); }
        catch (IllegalStateException expected) { jsonRejected = true; }
        require(jsonRejected, "Legacy JSON compatibility boundary changed");
        boolean enumRejected = false;
        try { JarAiStyle.valueOf("NEON_DRAWING"); }
        catch (IllegalArgumentException expected) { enumRejected = true; }
        require(enumRejected, "Legacy style compatibility boundary changed");
    }

    @Test @Order(7) void logoutRevokesReadAccess() throws Exception {
        Browser owner = new Browser(); owner.login(ownerLogin);
        require(owner.post("/api/v1/auth/logout", Map.of(), true).statusCode() == 200, "Logout failed");
        require(owner.get("/api/v1/jars/112").statusCode() == 401, "Logged-out read was not rejected");
    }

    /** 실패 시에도 응답·좌표·인증정보를 메시지에 넣지 않는다. */
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }

    /** 실제 HTTP와 쿠키/CSRF 처리로 검사하며 인증 필터나 저금통 Service는 대체하지 않는다. */
    private final class Browser {
        private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        private final HttpClient http = HttpClient.newBuilder().cookieHandler(cookies).connectTimeout(Duration.ofSeconds(5)).build();
        private URI uri(String path) { return URI.create("http://127.0.0.1:"+port+path); }
        private HttpResponse<String> get(String path) throws Exception {
            return http.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
        }
        private HttpResponse<String> post(String path, Object body, boolean csrf) throws Exception {
            var builder = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).header("Content-Type","application/json");
            if (csrf) {
                require(get("/api/v1/csrf").statusCode() == 200, "CSRF preparation failed");
                String token = cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("XSRF-TOKEN")).findFirst().orElseThrow().getValue();
                builder.header("X-XSRF-TOKEN", java.net.URLDecoder.decode(token,java.nio.charset.StandardCharsets.UTF_8));
            }
            return http.send(builder.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(), HttpResponse.BodyHandlers.ofString());
        }
        private void login(String login) throws Exception { require(post("/api/v1/auth/login", Map.of("loginId",login,"password",password), true).statusCode() == 200, "Real login failed"); }
    }
}
