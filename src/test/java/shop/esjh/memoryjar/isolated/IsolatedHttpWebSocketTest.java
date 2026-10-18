package shop.esjh.memoryjar.isolated;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import shop.esjh.memoryjar.MemoryJarApplication;
import shop.esjh.memoryjar.service.ai.*;
import shop.esjh.memoryjar.service.jar.JarOpenScheduler;
import shop.esjh.memoryjar.service.support.SupportCleanupScheduler;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 실제 HTTP 서버·인증 쿠키·STOMP 소켓·MariaDB를 연결하는 Docker 전용 기능 시험이다. */
@EnabledIfEnvironmentVariable(named = "ISOLATED_E2E", matches = "1")
@SpringBootTest(classes = MemoryJarApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.address=127.0.0.1", "spring.docker.compose.enabled=false",
                "management.server.port=9091", "management.server.address=127.0.0.1",
                "app.monitoring.login-diagnostics-enabled=true",
                "app.cookie.secure=false", "app.cookie.domain=", "app.cookie.same-site=Lax"})
class IsolatedHttpWebSocketTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired SimpUserRegistry registry;
    @MockitoBean S3Client s3;
    @MockitoBean S3Presigner presigner;
    @MockitoBean RekognitionClient rekognition;
    @MockitoBean SesV2Client ses;
    @MockitoBean CloudflareWorkersAiClient cloudflare;
    // 자동 정리 작업의 독립 실행은 여기서 제외한다. 실제 HTTP·보안·브로커는 대체하지 않는다.
    @MockitoBean JarOpenScheduler jarScheduler;
    @MockitoBean AiDraftCleanupScheduler aiScheduler;
    @MockitoBean SupportCleanupScheduler supportScheduler;
    private final Map<String, String> inbox = new ConcurrentHashMap<>();

    @Test void managementResourcesAreInternalReadOnlyAndContainLivePoolStats() throws Exception {
        Browser browser = new Browser();
        assertThat(browser.get("/actuator/resources").statusCode()).isEqualTo(403);
        assertThat(browser.get("/actuator/health").statusCode()).isEqualTo(403);
        var account = signup(browser);
        browser.okPost("/api/v1/auth/logout", Map.of(), 200);
        browser.okPost("/api/v1/auth/login", Map.of("loginId", account.login, "password", "Isolated123!"), 200);
        assertThat(browser.get("/actuator/resources").statusCode()).isEqualTo(403);
        var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:9091/actuator/resources"))
                .timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        var snapshot = json.readTree(response.body());
        Files.writeString(Path.of("/results/resources.json"), response.body()); // 시험 JVM 수치이며 EC2 수치가 아니다.
        assertThat(snapshot.path("measurable").asBoolean()).isTrue();
        assertThat(snapshot.path("heap").path("maxBytes").asLong()).isPositive();
        assertThat(snapshot.path("pools").get(0).path("maxConnections").asInt()).isPositive();
        assertThat(snapshot.path("pools").get(0).has("pendingRequests")).isTrue();
        assertThat(snapshot.path("gc").path("collectors").isArray()).isTrue();
        assertThat(snapshot.path("loginDiagnostics").path("enabled").asBoolean()).isTrue();
        var attempts = snapshot.path("loginDiagnostics").path("recent");
        assertThat(attempts.size()).isPositive();
        var stages = attempts.get(attempts.size() - 1).path("stages");
        for (String stage : List.of("CREDENTIAL_LOOKUP", "PASSWORD_VERIFY", "AUTH_SERVICE",
                "REFRESH_TRANSACTION", "JWT_CREATE", "COOKIE_WRITE")) {
            assertThat(stages.path(stage).path("completed").asBoolean()).isTrue();
            assertThat(stages.path(stage).path("elapsedNanos").asLong()).isPositive();
        }
        assertThat(response.body()).doesNotContain(account.login, account.email, "Isolated123!", "accessToken", "refreshToken");
        var healthResponse = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:9091/actuator/health"))
                .GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(healthResponse.statusCode()).isEqualTo(200);
        assertThat(json.readTree(healthResponse.body()).size()).isEqualTo(1);
        // 컨테이너의 실제 비-loopback 주소에서도 관리 listener에 연결할 수 없어야 한다.
        var address = java.net.NetworkInterface.networkInterfaces()
                .flatMap(network -> network.inetAddresses())
                .filter(ip -> ip instanceof java.net.Inet4Address && !ip.isLoopbackAddress())
                .findFirst().orElseThrow();
        try (var probe = new Socket()) {
            assertThatThrownBy(() -> probe.connect(new InetSocketAddress(address, 9091), 1000))
                    .isInstanceOf(java.io.IOException.class);
        }
        for (String endpoint : List.of("env", "configprops", "heapdump", "metrics")) {
            assertThat(client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:9091/actuator/" + endpoint))
                    .GET().build(), HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(403);
        }
        assertThat(client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:9091/actuator/resources"))
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(403);
    }

    @BeforeEach void captureSesOnly() {
        doAnswer(call -> {
            SendEmailRequest request = call.getArgument(0);
            var code = Pattern.compile("(?<!\\d)\\d{6}(?!\\d)")
                    .matcher(request.content().simple().body().text().data());
            if (!code.find()) throw new AssertionError("Verification code missing from SES request");
            inbox.put(request.destination().toAddresses().get(0), code.group());
            return SendEmailResponse.builder().messageId("isolated-mail").build();
        }).when(ses).sendEmail(any(SendEmailRequest.class));
    }

    /** 기본 경로가 없고 IPv4·IPv6·메타데이터 연결이 모두 실패해야 시험을 허용한다. */
    static void verifyEgressBlocked() throws Exception {
        if (Files.readAllLines(Path.of("/proc/net/route")).stream().skip(1)
                .map(line -> line.trim().split("\\s+")).anyMatch(parts -> parts.length > 1 && parts[1].equals("00000000"))) {
            throw new AssertionError("External default route must not exist");
        }
        for (String address : List.of("1.1.1.1", "8.8.8.8", "169.254.169.254", "2606:4700:4700::1111")) {
            boolean reached = false;
            try (var socket = new Socket()) {
                socket.connect(new InetSocketAddress(InetAddress.getByName(address), address.startsWith("169.") ? 80 : 443), 1000);
                reached = true;
            } catch (java.io.IOException blocked) { /* 예상된 연결 차단 */ }
            if (reached) throw new AssertionError("External TCP was reachable: " + address);
        }
        System.out.println("EGRESS PASS: no IPv4 default route; public IPv4/IPv6 and metadata TCP blocked");
    }

    @Test void emailSignupLoginAndHttpSecurity() throws Exception {
        Browser browser = new Browser();
        assertThat(browser.get("/api/v1/me").statusCode()).isEqualTo(401);
        assertThat(browser.post("/api/v1/auth/email-verifications", Map.of("email", email()), false).statusCode()).isEqualTo(403);
        Account account = signup(browser);
        assertThat(browser.post("/api/v1/auth/email-verifications/confirm",
                Map.of("email", account.email, "code", inbox.get(account.email)), true).statusCode()).isEqualTo(400);
        assertThat(browser.get("/api/v1/me").statusCode()).isEqualTo(200);
        assertThat(data(browser.post("/api/v1/auth/refresh", Map.of(), true), 200).path("ok").asBoolean()).isTrue();
        browser.okPost("/api/v1/auth/logout", Map.of(), 200);
        assertThat(browser.get("/api/v1/me").statusCode()).isEqualTo(401);
        browser.okPost("/api/v1/auth/login", Map.of("loginId", account.login, "password", "Isolated123!"), 200);
        assertThat(browser.get("/api/v1/jars").statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select consumed_at is not null from email_verifications where email=?", Boolean.class, account.email)).isTrue();
        verifyNoInteractions(s3, presigner, rekognition, cloudflare);
    }

    @Test void emailWrongExpiredResendAndProviderFailure() throws Exception {
        Browser browser = new Browser(); String email = email();
        browser.okPost("/api/v1/auth/email-verifications", Map.of("email", email), 200);
        assertThat(browser.post("/api/v1/auth/email-verifications", Map.of("email", email), true).statusCode()).isEqualTo(429);
        String wrong = inbox.get(email).equals("000000") ? "111111" : "000000";
        assertThat(browser.post("/api/v1/auth/email-verifications/confirm", Map.of("email", email, "code", wrong), true).statusCode()).isEqualTo(400);
        jdbc.update("update email_verifications set code_expires_at=date_sub(now(), interval 1 minute), last_sent_at=date_sub(now(), interval 2 minute) where email=?", email);
        assertThat(browser.post("/api/v1/auth/email-verifications/confirm", Map.of("email", email, "code", inbox.get(email)), true).statusCode()).isEqualTo(400);
        browser.okPost("/api/v1/auth/email-verifications", Map.of("email", email), 200);
        assertThat(browser.okPost("/api/v1/auth/email-verifications/confirm", Map.of("email", email, "code", inbox.get(email)), 200).path("verificationToken").asText()).isNotBlank();
        doThrow(SesV2Exception.builder().message("isolated unavailable").build()).when(ses).sendEmail(any(SendEmailRequest.class));
        assertThat(browser.post("/api/v1/auth/email-verifications", Map.of("email", email()), true).statusCode()).isEqualTo(502);
    }

    @Test void websocketChatPersistsBroadcastsRejoinsAndRejectsOutsiders() throws Exception {
        Browser owner = new Browser(); signup(owner);
        long jar = owner.okPost("/api/v1/jars", Map.of("name", "격리 시험", "theme", "SPRING", "maxMembers", 2,
                "openAt", "2099-01-01T00:00:00", "openMode", "ALL_AT_ONCE", "lockLevel", "TITLE_ONLY"), 201).path("jarId").asLong();
        try (SocketClient first = owner.socket()) {
            first.subscribe(jar);
            first.send("SEND\ndestination:/app/jars/" + jar + "/chat.send\ncontent-type:application/json\n\n"
                    + "{\"content\":\"socket hello\",\"requestId\":\"socket-first\"}\0");
            first.await("socket hello");
            assertThat(owner.get("/api/v1/jars/" + jar + "/chat/messages").body()).contains("socket hello");
        }
        try (SocketClient rejoined = owner.socket()) {
            rejoined.subscribe(jar);
            var request = Map.of("content", "REST fallback", "requestId", "rest-once");
            long id = owner.okPost("/api/v1/jars/" + jar + "/chat/messages", request, 201).path("messageId").asLong();
            rejoined.await("REST fallback");
            assertThat(owner.okPost("/api/v1/jars/" + jar + "/chat/messages", request, 201).path("messageId").asLong()).isEqualTo(id);
            assertThat(jdbc.queryForObject("select count(*) from chat_messages where jar_id=? and client_request_id=?", Integer.class, jar, "rest-once")).isEqualTo(1);
        }
        Browser outsider = new Browser(); signup(outsider);
        assertThat(outsider.get("/api/v1/jars/" + jar + "/chat/messages").statusCode()).isEqualTo(403);
        try (SocketClient denied = outsider.socket()) {
            denied.send("SUBSCRIBE\nid:denied\ndestination:/topic/jars/" + jar + "/chat\n\n\0");
            denied.await("ERROR");
        }
    }

    private record Account(String login, String email) { }
    private String email() { return UUID.randomUUID() + "@example.invalid"; }
    private Account signup(Browser browser) throws Exception {
        String email = email(); String login = "test" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        browser.okPost("/api/v1/auth/email-verifications", Map.of("email", email), 200);
        String token = browser.okPost("/api/v1/auth/email-verifications/confirm", Map.of("email", email, "code", inbox.get(email)), 200).path("verificationToken").asText();
        browser.okPost("/api/v1/auth/signup", Map.of("loginId", login, "password", "Isolated123!", "nickname", "시험친구", "email", email, "verificationToken", token), 200);
        return new Account(login, email);
    }
    private JsonNode data(HttpResponse<String> response, int status) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        return json.readTree(response.body()).path("data");
    }

    /** 실제 브라우저처럼 CSRF와 인증 쿠키를 유지하지만 토큰을 출력하지 않는다. */
    private class Browser {
        final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).connectTimeout(Duration.ofSeconds(5)).build();
        URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
        HttpResponse<String> get(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
        }
        HttpResponse<String> post(String path, Object body, boolean csrf) throws Exception {
            var request = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json");
            if (csrf) {
                var token = data(get("/api/v1/csrf"), 200);
                request.header(token.path("headerName").asText(), token.path("token").asText());
            }
            return client.send(request.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(), HttpResponse.BodyHandlers.ofString());
        }
        JsonNode okPost(String path, Object body, int status) throws Exception { return data(post(path, body, true), status); }
        SocketClient socket() throws Exception {
            var listener = new SocketClient();
            listener.socket = client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5))
                    .buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws"), listener).get(10, TimeUnit.SECONDS);
            listener.send("CONNECT\naccept-version:1.2\nhost:localhost\nheart-beat:0,0\n\n\0");
            listener.await("CONNECTED");
            return listener;
        }
    }

    /** STOMP 프레임 수신을 기다려 HTTP 저장부터 소켓 전달까지 확인하는 최소 시험 클라이언트다. */
    private class SocketClient implements WebSocket.Listener, AutoCloseable {
        WebSocket socket;
        final BlockingQueue<String> frames = new LinkedBlockingQueue<>();
        final StringBuilder partial = new StringBuilder();
        public void onOpen(WebSocket socket) { socket.request(1); }
        public CompletionStage<?> onText(WebSocket socket, CharSequence text, boolean last) {
            partial.append(text);
            if (last) { frames.add(partial.toString()); partial.setLength(0); }
            socket.request(1); return null;
        }
        public void onError(WebSocket socket, Throwable failure) { frames.add("TRANSPORT_FAILURE"); }
        void send(String frame) { socket.sendText(frame, true).join(); }
        void await(String marker) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while (System.nanoTime() < deadline) {
                String frame = frames.poll(200, TimeUnit.MILLISECONDS);
                if (frame != null && frame.contains(marker)) return;
                if (frame != null && (frame.contains("ERROR") || frame.contains("TRANSPORT_FAILURE"))) fail("Unexpected STOMP failure");
            }
            fail("STOMP response deadline exceeded for " + marker);
        }
        void subscribe(long jar) throws Exception {
            String destination = "/topic/jars/" + jar + "/chat";
            String subscriptionId = UUID.randomUUID().toString();
            send("SUBSCRIBE\nid:" + subscriptionId + "\ndestination:" + destination + "\n\n\0");
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (registry.findSubscriptions(sub -> subscriptionId.equals(sub.getId())
                    && destination.equals(sub.getDestination())).isEmpty()) {
                if (System.nanoTime() > deadline) fail("Subscription was not registered");
                Thread.sleep(25);
            }
        }
        public void close() {
            if (socket != null) {
                try { if (!socket.isOutputClosed()) send("DISCONNECT\n\n\0"); }
                catch (CompletionException | IllegalStateException alreadyClosed) { /* 권한 거절로 닫힌 소켓 */ }
                finally { socket.abort(); }
            }
        }
    }
}
