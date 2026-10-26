package shop.esjh.memoryjar.monitoring;

import java.io.IOException;
import java.lang.reflect.Field;
import java.util.concurrent.TimeUnit;
import org.apache.http.HttpClientConnection;
import org.apache.http.HttpEntityEnclosingRequest;
import org.apache.http.HttpException;
import org.apache.http.HttpRequest;
import org.apache.http.HttpResponse;
import org.apache.http.conn.ConnectionRequest;
import org.apache.http.conn.HttpClientConnectionManager;
import org.apache.http.conn.routing.HttpRoute;
import org.apache.http.impl.execchain.MainClientExec;
import org.apache.http.protocol.HttpContext;
import org.apache.http.protocol.HttpRequestExecutor;
import software.amazon.awssdk.http.HttpExecuteRequest;
import software.amazon.awssdk.http.ExecutableHttpRequest;
import software.amazon.awssdk.http.SdkHttpClient;
import software.amazon.awssdk.http.apache.ApacheHttpClient;
import software.amazon.awssdk.http.apache.internal.impl.ConnectionManagerAwareHttpClient;
import software.amazon.awssdk.utils.AttributeMap;

/**
 * 명시적으로 켠 로컬 진단에서만 기존 Apache 실행기의 연결/GET 송신/헤더 수신 경계를 잰다.
 * 기본 TLS·DNS·프록시·연결 풀은 새로 구현하지 않고 원래 객체에 그대로 위임한다.
 * SDK가 공개 관찰 API를 제공하지 않는 부분은 아래의 한정된 내부 필드 연결에만 격리한다.
 */
public final class TextureHttpTransportDiagnostics implements SdkHttpClient.Builder<TextureHttpTransportDiagnostics> {
    @Override public SdkHttpClient buildWithDefaults(AttributeMap serviceDefaults) {
        TextureDiagnosticsClock.initialize();
        // SDK가 전달한 서비스별 설정과 Apache 기본값을 먼저 그대로 적용한다.
        var delegate = ApacheHttpClient.builder().buildWithDefaults(serviceDefaults);
        try {
            install(delegate);
            return new ObservedClient(delegate);
        } catch (ReflectiveOperationException | RuntimeException unsupported) {
            delegate.close();
            // 지원하지 않는 버전에서 일부만 계측한 값을 정확한 결과인 것처럼 제공하지 않는다.
            throw new IllegalStateException("로컬 HTTP 계측이 현재 클라이언트 구조를 지원하지 않습니다. 계측 인수를 끄고 재시작해 주세요.");
        }
    }

    /** 요청 시작 전 한 번만 연결한다. 업그레이드 시 구조/기본 실행기가 달라지면 시작 단계에서 거절한다. */
    private static void install(SdkHttpClient client) throws ReflectiveOperationException {
        if (client.getClass() != ApacheHttpClient.class) throw new IllegalStateException("Unsupported HTTP client");
        var sdkAdapter = field(client.getClass(), "httpClient").get(client);
        requireType(sdkAdapter, "software.amazon.awssdk.http.apache.internal.impl.ApacheSdkHttpClient");
        var apache = field(sdkAdapter.getClass(), "delegate").get(sdkAdapter);
        requireType(apache, "org.apache.http.impl.client.InternalHttpClient");
        var chain = field(apache.getClass(), "execChain").get(apache);
        // SDK 2.31.67의 기본 실행 경로만 허용한다. 프록시·재시도 실행기를 임의로 탐색/치환하지 않는다.
        requireType(chain, "org.apache.http.impl.execchain.ProtocolExec");
        var main = field(chain.getClass(), "requestExecutor").get(chain);
        if (main.getClass() != MainClientExec.class) throw new IllegalStateException("Unsupported execution chain");
        var executorField = field(MainClientExec.class, "requestExecutor");
        var managerField = field(MainClientExec.class, "connManager");
        var executor = executorField.get(main);
        if (executor.getClass() != HttpRequestExecutor.class) throw new IllegalStateException("Custom executor is not supported");
        var manager = (HttpClientConnectionManager) managerField.get(main);
        // 기존 DNS/SSL 공장에 위임하는 관찰자만 설치한다. 새 SSLContext/신뢰 관리자/접속 주소는 만들지 않는다.
        TextureSocketDiagnostics.install(((ConnectionManagerAwareHttpClient) sdkAdapter).getHttpClientConnectionManager());
        // 기본 executor는 new HttpRequestExecutor()다. 동일한 super 로직에 앞뒤 숫자 기록만 추가한다.
        executorField.set(main, new ObservedExecutor());
        managerField.set(main, new ObservedConnections(manager));
    }

    private static Field field(Class<?> type, String name) throws NoSuchFieldException {
        var field = type.getDeclaredField(name);
        if (!field.trySetAccessible()) throw new IllegalStateException("HTTP observation field is inaccessible");
        return field;
    }

    private static void requireType(Object value, String expected) {
        if (value == null || !value.getClass().getName().equals(expected)) throw new IllegalStateException("Unsupported HTTP layout");
    }

    /** 원래 클라이언트의 수명과 요청 객체를 그대로 유지하고 설치 여부 숫자만 현재 이미지 요청에 남긴다. */
    static final class ObservedClient implements SdkHttpClient {
        private final SdkHttpClient delegate;
        ObservedClient(SdkHttpClient delegate) { this.delegate = delegate; }
        @Override public ExecutableHttpRequest prepareRequest(HttpExecuteRequest request) {
            var owner = LoginDiagnostics.textureSdkOwner();
            if (owner != null) {
                LoginDiagnostics.recordS3Counter(owner, LoginDiagnostics.S3SdkCounter.HTTP_TRANSPORT_OBSERVER, 1);
                LoginDiagnostics.recordS3Counter(owner, LoginDiagnostics.S3SdkCounter.HTTP_SOCKET_OBSERVER, 1);
            }
            return delegate.prepareRequest(request);
        }
        @Override public String clientName() { return delegate.clientName(); }
        @Override public void close() { delegate.close(); }
    }

    /** GET 헤더 송신/flush와 그 뒤 응답 헤더 수신을 구분한다. 본문을 추가로 읽거나 복사하지 않는다. */
    static final class ObservedExecutor extends HttpRequestExecutor {
        @Override protected HttpResponse doSendRequest(HttpRequest request, HttpClientConnection connection, HttpContext context)
                throws IOException, HttpException {
            var measurement = getOwner(request) == null ? null : TextureDiagnosticsClock.begin(); boolean completed = false;
            try {
                var response = super.doSendRequest(request, connection, context);
                completed = true; return response;
            } finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_SEND, completed); }
        }

        @Override protected HttpResponse doReceiveResponse(HttpRequest request, HttpClientConnection connection, HttpContext context)
                throws IOException, HttpException {
            var measurement = getOwner(request) == null ? null : TextureDiagnosticsClock.begin(); boolean completed = false;
            try {
                var response = super.doReceiveResponse(request, connection, context);
                completed = true; return response;
            } finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_RECEIVE_HEADERS, completed); }
        }

        private LoginDiagnostics.Attempt getOwner(HttpRequest request) {
            // GET 이외 요청 및 Expect:100-continue/본문 전송은 이 이미지 측정의 의미와 다르므로 기록하지 않는다.
            return !(request instanceof HttpEntityEnclosingRequest) && "GET".equals(request.getRequestLine().getMethod())
                    ? LoginDiagnostics.textureSdkOwner() : null;
        }
    }

    /** 기존 풀/시간 제한/SSL 검증에 전부 위임한다. connect에는 DNS와 TCP 및 직접 HTTPS의 TLS가 포함된다. */
    static final class ObservedConnections implements HttpClientConnectionManager {
        private final HttpClientConnectionManager delegate;
        ObservedConnections(HttpClientConnectionManager delegate) { this.delegate = delegate; }
        @Override public void connect(HttpClientConnection connection, HttpRoute route, int timeout, HttpContext context) throws IOException {
            var measurement = TextureDiagnosticsClock.begin(); boolean completed = false;
            try { delegate.connect(connection, route, timeout, context); completed = true; }
            finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_CONNECT, completed); }
        }
        @Override public void upgrade(HttpClientConnection connection, HttpRoute route, HttpContext context) throws IOException {
            var measurement = TextureDiagnosticsClock.begin(); boolean completed = false;
            try { delegate.upgrade(connection, route, context); completed = true; }
            finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_TLS_UPGRADE, completed); }
        }
        @Override public ConnectionRequest requestConnection(HttpRoute route, Object state) { return delegate.requestConnection(route, state); }
        @Override public void releaseConnection(HttpClientConnection connection, Object state, long duration, TimeUnit unit) {
            delegate.releaseConnection(connection, state, duration, unit);
        }
        @Override public void routeComplete(HttpClientConnection connection, HttpRoute route, HttpContext context) throws IOException {
            delegate.routeComplete(connection, route, context);
        }
        @Override public void closeIdleConnections(long idle, TimeUnit unit) { delegate.closeIdleConnections(idle, unit); }
        @Override public void closeExpiredConnections() { delegate.closeExpiredConnections(); }
        @Override public void shutdown() { delegate.shutdown(); }
    }
}
