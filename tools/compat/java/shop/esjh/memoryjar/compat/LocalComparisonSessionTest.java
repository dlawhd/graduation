package shop.esjh.memoryjar.compat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import shop.esjh.memoryjar.MemoryJarApplication;
import shop.esjh.memoryjar.dto.ai.CustomJarBodyValue;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserLocalCredential;
import shop.esjh.memoryjar.entity.ai.JarDesign;
import shop.esjh.memoryjar.entity.ai.JarPhotoFrame;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.jar.JarMember;
import shop.esjh.memoryjar.entity.jar.JarOpenEvent;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.enums.ai.JarDesignType;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import shop.esjh.memoryjar.enums.jar.JarOpenReason;
import shop.esjh.memoryjar.service.ai.AiDraftCleanupScheduler;
import shop.esjh.memoryjar.service.ai.CloudflareWorkersAiClient;
import shop.esjh.memoryjar.service.jar.JarOpenScheduler;
import shop.esjh.memoryjar.service.support.SupportCleanupScheduler;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.sesv2.SesV2Client;

/** 옛 앱과 현재 앱을 같은 합성 데이터로 시작한다. AWS 대신 내부 사진 서버만 사용하는 로컬 비교 세션이다. */
@SpringBootTest(classes=MemoryJarApplication.class, webEnvironment=SpringBootTest.WebEnvironment.DEFINED_PORT,
    properties={"server.address=0.0.0.0", "server.port=8080", "spring.docker.compose.enabled=false",
        "spring.profiles.active=test", "spring.jpa.show-sql=false", "logging.level.root=WARN",
        "app.cookie.secure=false", "app.cookie.domain=", "app.cookie.same-site=Lax",
        "app.frontend-url=http://127.0.0.1:18900", "app.cors.allowed-origin-patterns[0]=http://127.0.0.1:18900",
        "app.cors.allowed-origin-patterns[1]=http://localhost:18901"})
class LocalComparisonSessionTest {
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired PlatformTransactionManager transactions;
    @PersistenceContext EntityManager em;
    // 실제 SDK로 로컬 HTTP를 읽는다. 앱의 Controller/Service/캐시/권한 검사는 대체하지 않는다.
    @TestBean(methodName="localS3Client") S3Client s3Client;
    @TestBean(methodName="localPresigner") S3Presigner s3Presigner;
    @MockitoBean RekognitionClient rekognition;
    @MockitoBean SesV2Client ses;
    @MockitoBean CloudflareWorkersAiClient cloudflare;
    @MockitoBean JarOpenScheduler jarScheduler;
    @MockitoBean AiDraftCleanupScheduler aiScheduler;
    @MockitoBean SupportCleanupScheduler supportScheduler;

    /** 시험 전용 가짜 인증정보다. 운영 키를 읽거나 전달하지 않는다. */
    private static StaticCredentialsProvider credentials() {
        return StaticCredentialsProvider.create(AwsBasicCredentials.create("local-fixture-only", "local-fixture-not-an-aws-secret"));
    }
    /** SDK의 서명/응답 처리는 유지하고 통신 대상만 내부 사진 서버로 고정한다. */
    static S3Client localS3Client() {
        return S3Client.builder().region(Region.AP_NORTHEAST_2).credentialsProvider(credentials())
            .endpointOverride(URI.create("http://asset:9000")).forcePathStyle(true)
            .overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(10)).apiCallAttemptTimeout(Duration.ofSeconds(5)))
            .build();
    }
    /** 브라우저가 접근할 주소도 loopback의 시험 사진 서버로만 서명한다. 실제 S3 서명 유효성 시험은 아니다. */
    static S3Presigner localPresigner() {
        return S3Presigner.builder().region(Region.AP_NORTHEAST_2).credentialsProvider(credentials())
            .endpointOverride(URI.create("http://127.0.0.1:18903"))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).build();
    }

    /** 새 계정과 합성 저금통만 넣고 브라우저 비교가 끝날 때까지 앱을 유지한다. 2시간 뒤에는 자동 종료한다. */
    @Test void startIsolatedBrowserSession() throws Exception {
        JsonNode fixture=json.readTree(Files.readString(Path.of("/session/design.json")));
        JsonNode account=json.readTree(Files.readString(Path.of("/session/account-private.json")));
        var body=json.treeToValue(fixture.path("customBody"),CustomJarBodyValue.class);
        if(!body.isUsableOutline()) throw new IllegalStateException("Invalid synthetic outline");
        var photo=json.treeToValue(fixture.path("photoFrame"),JarPhotoFrameValue.class);
        if(jdbc.queryForObject("select count(*) from users",Integer.class)!=0)
            throw new IllegalStateException("Empty disposable DB required");
        new TransactionTemplate(transactions).execute(status->{
            User owner=User.builder().email("comparison@example.invalid").name("로컬 비교 계정").build();
            em.persist(owner);
            em.persist(UserLocalCredential.builder().user(owner).loginId(account.path("loginId").asText())
                .passwordHash(passwords.encode(account.path("password").asText())).build());
            User outsider=User.builder().email("outsider@example.invalid").name("로컬 비회원").build();
            em.persist(outsider);
            em.persist(UserLocalCredential.builder().user(outsider).loginId("localoutsider")
                .passwordHash(passwords.encode(account.path("password").asText())).build());
            em.flush();
            jdbc.update("insert into jars(jar_id,owner_id,name,description,theme,max_members,open_at,open_mode,lock_level) values(112,?,?,?,?,?,?,?,?)",
                owner.getId(),"같은 조건의 로컬 비교","운영과 분리된 합성 데이터",fixture.path("theme").asText(),2,
                java.sql.Timestamp.valueOf(LocalDateTime.of(2020,1,1,0,0)),"ALL_AT_ONCE","HIDDEN");
            Jar jar=em.find(Jar.class,112L);
            em.persist(JarMember.createOwner(jar,owner));
            em.persist(JarOpenEvent.create(jar,LocalDateTime.of(2020,1,1,0,0),JarOpenReason.SCHEDULED));
            em.persist(JarDesign.builder().jar(jar).designType(JarDesignType.ORIGINAL)
                .finalS3Key("compatibility/fixture.png").bodyStyle(JarBodyStyle.CUSTOM).customBody(body)
                .photoFrame(new JarPhotoFrame(photo)).slotStyle(JarSlotStyle.CAPSULE)
                .slotCenterX(new BigDecimal("0.5")).slotCenterY(new BigDecimal("0.75"))
                .slotSizeRatio(new BigDecimal("0.12")).build());
            em.flush();return null;
        });
        verifyHttpBoundary(account,fixture);
        Files.writeString(Path.of("/session/ready-"+System.getenv("COMPARISON_VARIANT")+".json"),
            json.writeValueAsString(Map.of("status","READY","schemaVersion",53,"syntheticData",true,
                "httpBoundaryChecks",7,"backendCommit",System.getenv("COMPARISON_BACKEND_COMMIT"))));
        long deadline=System.nanoTime()+Duration.ofHours(2).toNanos();
        while(!Files.exists(Path.of("/session/STOP")) && System.nanoTime()<deadline) Thread.sleep(250);
    }

    /** 실제 HTTP 로그인·CSRF·멤버 권한과 동일 표시 필드를 확인한다. 사진 API는 미리 호출해 캐시를 데우지 않는다. */
    private void verifyHttpBoundary(JsonNode account,JsonNode fixture) throws Exception {
        var owner=new TrialBrowser();
        check(owner.get("/api/v1/jars/112").statusCode()==401,"anonymous");
        var body=Map.of("loginId",account.path("loginId").asText(),"password",account.path("password").asText());
        check(owner.post(body,false).statusCode()==403,"csrf");
        check(owner.post(Map.of("loginId",body.get("loginId"),"password",body.get("password")+"wrong"),true).statusCode()==401,"wrong-password");
        check(owner.post(body,true).statusCode()==200,"login");
        var response=owner.get("/api/v1/jars/112");check(response.statusCode()==200,"detail");
        var design=json.readTree(response.body()).path("data").path("design");
        check(design.path("customBody").path("points").equals(fixture.path("customBody").path("points"))
            && design.path("customBody").path("color").equals(fixture.path("customBody").path("color")),"outline");
        for(String field:java.util.List.of("x","y","width","height"))
            check(design.path("photoFrame").path(field).decimalValue().compareTo(fixture.path("photoFrame").path(field).decimalValue())==0,"placement");
        check(owner.get("/api/v1/jars/999999").statusCode()==404,"missing");
        var outsider=new TrialBrowser();check(outsider.post(Map.of("loginId","localoutsider","password",body.get("password")),true).statusCode()==200,"outsider-login");
        check(outsider.get("/api/v1/jars/112").statusCode()==403,"membership");
    }
    private static void check(boolean value,String name){if(!value)throw new AssertionError("Local HTTP boundary: "+name);}

    /** 시험 계정으로만 실제 쿠키와 CSRF 흐름을 수행한다. 응답과 쿠키를 로그에 출력하지 않는다. */
    private final class TrialBrowser {
        private final java.net.CookieManager cookies=new java.net.CookieManager(null,java.net.CookiePolicy.ACCEPT_ALL);
        private final java.net.http.HttpClient http=java.net.http.HttpClient.newBuilder().cookieHandler(cookies).connectTimeout(Duration.ofSeconds(5)).build();
        java.net.http.HttpResponse<String> get(String path) throws Exception {
            return http.send(java.net.http.HttpRequest.newBuilder(URI.create("http://127.0.0.1:8080"+path)).timeout(Duration.ofSeconds(15)).GET().build(),java.net.http.HttpResponse.BodyHandlers.ofString());
        }
        java.net.http.HttpResponse<String> post(Object value,boolean csrf) throws Exception {
            var request=java.net.http.HttpRequest.newBuilder(URI.create("http://127.0.0.1:8080/api/v1/auth/login")).timeout(Duration.ofSeconds(15)).header("Content-Type","application/json");
            if(csrf){var data=json.readTree(get("/api/v1/csrf").body()).path("data");request.header(data.path("headerName").asText(),data.path("token").asText());}
            return http.send(request.POST(java.net.http.HttpRequest.BodyPublishers.ofString(json.writeValueAsString(value))).build(),java.net.http.HttpResponse.BodyHandlers.ofString());
        }
    }
}
