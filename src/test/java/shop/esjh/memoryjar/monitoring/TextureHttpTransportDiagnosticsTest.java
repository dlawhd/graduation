package shop.esjh.memoryjar.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpsServer;
import com.sun.net.httpserver.HttpsConfigurator;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.apache.http.HttpClientConnection;
import org.apache.http.HttpException;
import org.apache.http.HttpHost;
import org.apache.http.HttpVersion;
import org.apache.http.conn.HttpClientConnectionManager;
import org.apache.http.conn.routing.HttpRoute;
import org.apache.http.message.BasicHttpRequest;
import org.apache.http.message.BasicHttpResponse;
import org.apache.http.protocol.BasicHttpContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.springframework.mock.env.MockEnvironment;
import shop.esjh.memoryjar.config.S3Config;
import shop.esjh.memoryjar.config.properties.S3Properties;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.http.HttpExecuteRequest;
import software.amazon.awssdk.http.SdkHttpClient;
import software.amazon.awssdk.http.SdkHttpConfigurationOption;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.utils.AttributeMap;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 외부 AWS/실제 인증정보 없이 원래 HTTP 동작·예외·연결 재사용과 숫자 경계만 검증한다. */
class TextureHttpTransportDiagnosticsTest {
    private final ObjectMapper json = new ObjectMapper();
    private LoginDiagnostics enabled() { return new LoginDiagnostics(false, false, true, () -> null); }

    @Test void installedDefaultApacheClientBuildsAndClosesWithoutNetwork() {
        try (var client = new TextureHttpTransportDiagnostics().buildWithDefaults(AttributeMap.empty())) {
            assertThat(client).isInstanceOf(TextureHttpTransportDiagnostics.ObservedClient.class);
            assertThat(client.clientName()).containsIgnoringCase("apache");
        }
    }

    @Test void adapterDoesNotChangeRequestsAndClosesOriginalClient() {
        var delegate = mock(SdkHttpClient.class); var request = mock(HttpExecuteRequest.class);
        var executable = mock(software.amazon.awssdk.http.ExecutableHttpRequest.class);
        when(delegate.prepareRequest(request)).thenReturn(executable);
        var client = new TextureHttpTransportDiagnostics.ObservedClient(delegate);
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try { assertThat(client.prepareRequest(request)).isSameAs(executable); }
        finally { diagnostics.finish(attempt, 200, true); client.close(); }
        verify(delegate).prepareRequest(same(request)); verify(delegate).close();
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().counters()
                .get(LoginDiagnostics.S3SdkCounter.HTTP_TRANSPORT_OBSERVER)).containsExactly(1);
    }

    @Test void managerPreservesOriginalConnectionTlsTimeoutAndAllLifecycleCalls() throws Exception {
        var delegate = mock(HttpClientConnectionManager.class);
        var manager = new TextureHttpTransportDiagnostics.ObservedConnections(delegate);
        var connection = mock(HttpClientConnection.class);
        var route = new HttpRoute(new HttpHost("private.example", 443, "https")); var context = new BasicHttpContext();
        var state = new Object(); var unit = TimeUnit.SECONDS; var request = mock(org.apache.http.conn.ConnectionRequest.class);
        when(delegate.requestConnection(route, state)).thenReturn(request);
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            assertThat(manager.requestConnection(route, state)).isSameAs(request);
            manager.connect(connection, route, 12345, context); manager.upgrade(connection, route, context);
            manager.routeComplete(connection, route, context); manager.releaseConnection(connection, state, 9, unit);
            manager.closeIdleConnections(8, unit); manager.closeExpiredConnections(); manager.shutdown();
        } finally { diagnostics.finish(attempt, 200, true); }
        verify(delegate).connect(same(connection), same(route), eq(12345), same(context));
        verify(delegate).upgrade(same(connection), same(route), same(context));
        verify(delegate).routeComplete(connection, route, context); verify(delegate).releaseConnection(connection, state, 9, unit);
        verify(delegate).closeIdleConnections(8, unit); verify(delegate).closeExpiredConnections(); verify(delegate).shutdown();
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().durations())
                .containsKeys(LoginDiagnostics.S3SdkDuration.HTTP_CONNECT, LoginDiagnostics.S3SdkDuration.HTTP_TLS_UPGRADE);
    }

    @Test void originalConnectFailureIsPreservedAndOnlyFailureNumberIsStored() throws Exception {
        var delegate = mock(HttpClientConnectionManager.class); var manager = new TextureHttpTransportDiagnostics.ObservedConnections(delegate);
        var failure = new IOException("private-url-and-secret"); doThrow(failure).when(delegate).connect(any(), any(), anyInt(), any());
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try { assertThatThrownBy(() -> manager.connect(mock(HttpClientConnection.class), new HttpRoute(new HttpHost("private.example")), 100, new BasicHttpContext())).isSameAs(failure); }
        finally { diagnostics.finish(attempt, 502, false); }
        var sdk = diagnostics.snapshot().textures().recent().get(0).s3Sdk();
        assertThat(sdk.counters().get(LoginDiagnostics.S3SdkCounter.HTTP_TRANSPORT_FAILURE)).containsExactly(1);
        assertThat(json.writeValueAsString(sdk)).doesNotContain("private", "secret", "http://");
    }

    @Test void executorKeepsGetSendFlushReceiveOrderAndOriginalResponseWithoutReadingBody() throws Exception {
        var connection = mock(HttpClientConnection.class); var request = new BasicHttpRequest("GET", "/private-key");
        var response = new BasicHttpResponse(HttpVersion.HTTP_1_1, 200, "OK");
        when(connection.receiveResponseHeader()).thenReturn(response);
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try { assertThat(new TextureHttpTransportDiagnostics.ObservedExecutor().execute(request, connection, new BasicHttpContext())).isSameAs(response); }
        finally { diagnostics.finish(attempt, 200, true); }
        var order = inOrder(connection); order.verify(connection).sendRequestHeader(request); order.verify(connection).flush();
        order.verify(connection).receiveResponseHeader(); order.verify(connection).receiveResponseEntity(response);
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().durations())
                .containsKeys(LoginDiagnostics.S3SdkDuration.HTTP_SEND, LoginDiagnostics.S3SdkDuration.HTTP_RECEIVE_HEADERS);
    }

    @Test void receiveFailureIsNotConvertedOrSwallowedAndConnectionStillCloses() throws Exception {
        var connection = mock(HttpClientConnection.class); var failure = new HttpException("private-response");
        when(connection.receiveResponseHeader()).thenThrow(failure);
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try { assertThatThrownBy(() -> new TextureHttpTransportDiagnostics.ObservedExecutor().execute(new BasicHttpRequest("GET", "/private"), connection, new BasicHttpContext())).isSameAs(failure); }
        finally { diagnostics.finish(attempt, 502, false); }
        verify(connection).close();
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().counters()
                .get(LoginDiagnostics.S3SdkCounter.HTTP_TRANSPORT_FAILURE)).containsExactly(1);
    }

    @Test void disabledOrNonTextureContextNeverCollectsTransportNumbers() throws Exception {
        for (var kind : List.of(LoginDiagnostics.RequestKind.LOGIN, LoginDiagnostics.RequestKind.JAR_DETAIL)) {
            var diagnostics = new LoginDiagnostics(true, true); var attempt = diagnostics.start(kind);
            try {
                var connection = mock(HttpClientConnection.class);
                when(connection.receiveResponseHeader()).thenReturn(new BasicHttpResponse(HttpVersion.HTTP_1_1, 200, "OK"));
                new TextureHttpTransportDiagnostics.ObservedExecutor().execute(new BasicHttpRequest("GET", "/private"), connection, new BasicHttpContext());
                new TextureHttpTransportDiagnostics.ObservedConnections(mock(HttpClientConnectionManager.class))
                        .connect(connection, new HttpRoute(new HttpHost("private.example")), 100, new BasicHttpContext());
            } finally { diagnostics.finish(attempt, 200, true); }
            var samples = kind == LoginDiagnostics.RequestKind.LOGIN ? diagnostics.snapshot().recent() : diagnostics.snapshot().reads().recent();
            assertThat(samples.get(0).s3Sdk().durations()).isEmpty();
        }
    }

    @Test void s3ConfigurationRejectsObserverForProdAndDisabledLocal() {
        for (var profiles : List.of(new String[]{"prod"}, new String[]{"local", "prod"}, new String[]{"test"}, new String[]{"local"})) {
            var environment = new MockEnvironment(); environment.setActiveProfiles(profiles);
            boolean flag = !List.of(profiles).equals(List.of("local"));
            var diagnostics = new LoginDiagnostics(false, false, flag, environment);
            var properties = new S3Properties(); properties.setRegion("us-east-1");
            try (var ignored = new S3Config().s3Client(properties, diagnostics)) {
                assertThat(diagnostics.textureDiagnosticsEnabled()).isFalse();
            }
        }
        var local = new MockEnvironment(); local.setActiveProfiles("local");
        var properties = new S3Properties(); properties.setRegion("us-east-1");
        try (var ignored = new S3Config().s3Client(properties, new LoginDiagnostics(false, false, true, local))) { }
    }

    @Test void realSdkOverLoopbackSeparatesResponseDelayAndPreservesConnectionReuse() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10};
        var arrived = new CountDownLatch(1); var allowHeaders = new CountDownLatch(1);
        server.createContext("/", exchange -> {
            arrived.countDown();
            try { if (!allowHeaders.await(5, TimeUnit.SECONDS)) throw new IOException("fixture timeout"); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IOException("fixture interrupted"); }
            exchange.getResponseHeaders().add("Content-Type", "image/png");
            exchange.sendResponseHeaders(200, png.length);
            try (var output = exchange.getResponseBody()) { output.write(png); }
        });
        server.start(); var workers = Executors.newSingleThreadExecutor(); var diagnostics = enabled();
        try (var client = S3Client.builder().region(Region.US_EAST_1).forcePathStyle(true)
                .endpointOverride(URI.create("http://127.0.0.1:" + server.getAddress().getPort()))
                .credentialsProvider(() -> AwsBasicCredentials.create("fixture", "fixture-secret"))
                .httpClientBuilder(new TextureHttpTransportDiagnostics()).build()) {
            var first = workers.submit(() -> readFixture(client, diagnostics, png));
            assertThat(arrived.await(5, TimeUnit.SECONDS)).isTrue();
            // 서버가 헤더를 보류한 동안 클라이언트의 수신 구간에 대기가 들어가는지 확인한다.
            assertThat(first.isDone()).isFalse(); allowHeaders.countDown(); first.get(5, TimeUnit.SECONDS);
            workers.submit(() -> readFixture(client, diagnostics, png)).get(5, TimeUnit.SECONDS);
            var samples = diagnostics.snapshot().textures().recent(); assertThat(samples).hasSize(2);
            assertThat(samples.get(0).s3Sdk().durations()).containsKeys(LoginDiagnostics.S3SdkDuration.HTTP_CONNECT,
                    LoginDiagnostics.S3SdkDuration.HTTP_SEND, LoginDiagnostics.S3SdkDuration.HTTP_RECEIVE_HEADERS);
            assertThat(samples.get(1).s3Sdk().durations()).containsKeys(LoginDiagnostics.S3SdkDuration.HTTP_SEND,
                    LoginDiagnostics.S3SdkDuration.HTTP_RECEIVE_HEADERS).doesNotContainKey(LoginDiagnostics.S3SdkDuration.HTTP_CONNECT);
            assertThat(json.writeValueAsString(samples)).doesNotContain("fixture-secret", "private-key", "127.0.0.1");
        } finally { allowHeaders.countDown(); server.stop(0); workers.shutdownNow(); }
    }

    @Test void loopbackTlsKeepsCertificateAndHostnameVerificationAndRecordsRealConnect(@TempDir Path temporary) throws Exception {
        // 시험용 키는 JUnit 임시 폴더에만 생성한다. 실제 AWS/계정/운영 인증서는 사용하지 않는다.
        var store = temporary.resolve("fixture.p12"); char[] password = "fixture-only-password".toCharArray();
        var keytool = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool");
        var generator = new ProcessBuilder(keytool.toString(), "-genkeypair", "-alias", "fixture", "-keyalg", "RSA",
                "-keysize", "2048", "-validity", "1", "-dname", "CN=localhost", "-ext", "SAN=dns:localhost",
                "-storetype", "PKCS12", "-keystore", store.toString(), "-storepass", String.valueOf(password), "-noprompt")
                .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        if (!generator.waitFor(20, TimeUnit.SECONDS)) { generator.destroyForcibly(); throw new AssertionError("fixture key generation timeout"); }
        assertThat(generator.exitValue()).isZero();
        var keys = KeyStore.getInstance("PKCS12"); try (var input = Files.newInputStream(store)) { keys.load(input, password); }
        var keyManagers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()); keyManagers.init(keys, password);
        var trustManagers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()); trustManagers.init(keys);
        var ssl = SSLContext.getInstance("TLS"); ssl.init(keyManagers.getKeyManagers(), null, null);
        var server = HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0); server.setHttpsConfigurator(new HttpsConfigurator(ssl));
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10};
        server.createContext("/", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "image/png"); exchange.sendResponseHeaders(200, png.length);
            try (var output = exchange.getResponseBody()) { output.write(png); }
        }); server.start();
        try {
            // 기본 신뢰 저장소는 이 임시 자체 서명 인증서를 신뢰하지 않아야 한다.
            try (var http = new TextureHttpTransportDiagnostics().buildWithDefaults(AttributeMap.empty());
                 var client = fixtureTlsClient(http, "localhost", server.getAddress().getPort())) {
                assertThatThrownBy(() -> readFixture(client, enabled(), png))
                        .isInstanceOf(software.amazon.awssdk.core.exception.SdkClientException.class)
                        .satisfies(error -> assertThat(hasCause(error, javax.net.ssl.SSLHandshakeException.class)).isTrue());
            }
            var options = AttributeMap.builder().put(SdkHttpConfigurationOption.TLS_TRUST_MANAGERS_PROVIDER,
                    (software.amazon.awssdk.http.TlsTrustManagersProvider) trustManagers::getTrustManagers).build();
            // SDK에 전달된 신뢰 관리자도 그대로 사용하며 이름이 일치하는 인증서는 정상 통과한다.
            var diagnostics = enabled();
            try (var http = new TextureHttpTransportDiagnostics().buildWithDefaults(options);
                 var client = fixtureTlsClient(http, "localhost", server.getAddress().getPort())) {
                assertThat(readFixture(client, diagnostics, png)).isTrue();
                assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().durations())
                        .containsKeys(LoginDiagnostics.S3SdkDuration.HTTP_CONNECT, LoginDiagnostics.S3SdkDuration.HTTP_SEND,
                                LoginDiagnostics.S3SdkDuration.HTTP_RECEIVE_HEADERS);
            }
            // 인증서를 신뢰하더라도 SAN이 localhost뿐이면 IP 이름 불일치는 거절해야 한다.
            try (var http = new TextureHttpTransportDiagnostics().buildWithDefaults(options);
                 var client = fixtureTlsClient(http, "127.0.0.1", server.getAddress().getPort())) {
                assertThatThrownBy(() -> readFixture(client, enabled(), png))
                        .isInstanceOf(software.amazon.awssdk.core.exception.SdkClientException.class)
                        .satisfies(error -> assertThat(hasCause(error, javax.net.ssl.SSLPeerUnverifiedException.class)).isTrue());
            }
        } finally { server.stop(0); }
    }

    private S3Client fixtureTlsClient(SdkHttpClient http, String host, int port) {
        return S3Client.builder().region(Region.US_EAST_1).forcePathStyle(true)
                .endpointOverride(URI.create("https://" + host + ":" + port))
                .credentialsProvider(() -> AwsBasicCredentials.create("fixture", "fixture-secret"))
                .overrideConfiguration(config -> config.apiCallTimeout(java.time.Duration.ofSeconds(8))
                        .retryStrategy(software.amazon.awssdk.core.retry.RetryMode.STANDARD))
                .httpClient(http).build();
    }

    private boolean hasCause(Throwable error, Class<? extends Throwable> type) {
        for (int depth = 0; error != null && depth < 16; depth++, error = error.getCause()) {
            if (type.isInstance(error)) return true;
        }
        return false;
    }

    private boolean readFixture(S3Client client, LoginDiagnostics diagnostics, byte[] expected) throws IOException {
        var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        boolean completed = false;
        try (var stream = client.getObject(TextureS3Diagnostics.instrument(GetObjectRequest.builder().bucket("fixture").key("private-key")))) {
            assertThat(stream.readAllBytes()).isEqualTo(expected); completed = true; return true;
        } finally { diagnostics.finish(attempt, completed ? 200 : 502, completed); }
    }
}
