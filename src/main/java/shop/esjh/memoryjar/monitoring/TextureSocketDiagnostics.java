package shop.esjh.memoryjar.monitoring;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketAddress;
import java.net.SocketOption;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Set;
import java.util.function.BiFunction;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.apache.http.HttpHost;
import org.apache.http.config.Lookup;
import org.apache.http.conn.DnsResolver;
import org.apache.http.conn.HttpClientConnectionManager;
import org.apache.http.conn.socket.ConnectionSocketFactory;
import org.apache.http.conn.socket.LayeredConnectionSocketFactory;
import org.apache.http.impl.conn.DefaultHttpClientConnectionOperator;
import org.apache.http.impl.conn.PoolingHttpClientConnectionManager;
import org.apache.http.protocol.HttpContext;
import software.amazon.awssdk.http.apache.internal.conn.SdkTlsSocketFactory;
import software.amazon.awssdk.http.apache.internal.net.DelegateSocket;
import software.amazon.awssdk.http.apache.internal.net.DelegateSslSocket;

/**
 * 로컬 이미지 진단의 실제 DNS/TCP/TLS 경계만 관찰한다. SDK가 생성한 원래 공장/검증기/소켓에
 * 전부 위임하며 주소·인증서·사진·키·암호화 바이트를 저장하지 않는다. 내부 구조는 시작 때 검증한다.
 */
final class TextureSocketDiagnostics {
    private TextureSocketDiagnostics() { }

    /** 원래 객체의 설정을 복제하지 않는다. 현재 버전의 원래 DNS/SSL 객체에 숫자 관찰자를 연결한다. */
    static void install(HttpClientConnectionManager manager) throws ReflectiveOperationException {
        if (manager.getClass() != PoolingHttpClientConnectionManager.class) throw new IllegalStateException("Unsupported connection manager");
        var operator = field(PoolingHttpClientConnectionManager.class, "connectionOperator").get(manager);
        if (operator.getClass() != DefaultHttpClientConnectionOperator.class) throw new IllegalStateException("Unsupported connection operator");
        var dnsField = field(DefaultHttpClientConnectionOperator.class, "dnsResolver");
        var registryField = field(DefaultHttpClientConnectionOperator.class, "socketFactoryRegistry");
        var dns = (DnsResolver) dnsField.get(operator);
        @SuppressWarnings("unchecked")
        var registry = (Lookup<ConnectionSocketFactory>) registryField.get(operator);
        var https = registry.lookup("https");
        if (https.getClass() != SdkTlsSocketFactory.class) throw new IllegalStateException("Unsupported TLS factory");
        var sslType = org.apache.http.conn.ssl.SSLConnectionSocketFactory.class;
        var sslField = field(sslType, "socketfactory");
        var verifierField = field(sslType, "hostnameVerifier");
        var ssl = (SSLSocketFactory) sslField.get(https);
        var verifier = (HostnameVerifier) verifierField.get(https);
        // 기존 TLS 공장과 이름 검증기를 그대로 호출한다. 원래 인증서 신뢰/프로토콜/암호군을 바꾸지 않는다.
        sslField.set(https, new ObservedSslFactory(ssl));
        verifierField.set(https, new ObservedHostnameVerifier(verifier));
        dnsField.set(operator, new ObservedDns(dns));
        var observedHttps = new ObservedSocketFactory((LayeredConnectionSocketFactory) https);
        var http = registry.lookup("http");
        var observedHttp = new ObservedPlainFactory(http);
        registryField.set(operator, (Lookup<ConnectionSocketFactory>) scheme ->
                "https".equals(scheme) ? observedHttps : "http".equals(scheme) ? observedHttp : registry.lookup(scheme));
    }

    private static Field field(Class<?> type, String name) throws NoSuchFieldException {
        var field = type.getDeclaredField(name);
        if (!field.trySetAccessible()) throw new IllegalStateException("Socket diagnostic field is inaccessible");
        return field;
    }

    /** DNS 캐시/이름 풀이 정책은 원래 resolver에 맡기며 반환 주소 배열도 변경하지 않는다. */
    static final class ObservedDns implements DnsResolver {
        private final DnsResolver delegate;
        ObservedDns(DnsResolver delegate) { this.delegate = delegate; }
        @Override public InetAddress[] resolve(String host) throws UnknownHostException {
            var measurement = TextureDiagnosticsClock.begin(); boolean completed = false;
            try { var addresses = delegate.resolve(host); completed = true; return addresses; }
            finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_DNS, completed); }
        }
    }

    /** 원래 생성된 평문 소켓의 connect만 잰다. 이미 DNS가 끝난 주소/시간 제한을 그대로 전달한다. */
    static final class ObservedTcpSocket extends DelegateSocket {
        ObservedTcpSocket(Socket delegate) { super(delegate); }
        @Override public void connect(SocketAddress endpoint, int timeout) throws IOException {
            var measurement = TextureDiagnosticsClock.begin(); boolean completed = false;
            try { sock.connect(endpoint, timeout); completed = true; }
            finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_TCP_CONNECT, completed); }
        }
        @Override public void connect(SocketAddress endpoint) throws IOException { connect(endpoint, 0); }
        @Override public <T> Socket setOption(SocketOption<T> option, T value) throws IOException { sock.setOption(option, value); return this; }
        @Override public <T> T getOption(SocketOption<T> option) throws IOException { return sock.getOption(option); }
        @Override public Set<SocketOption<?>> supportedOptions() { return sock.supportedOptions(); }
    }

    /** 생성/접속 정책은 원래 공장에 맡기고 평문 소켓의 TCP 호출만 관찰 가능하게 한다. */
    static class ObservedPlainFactory implements ConnectionSocketFactory {
        final ConnectionSocketFactory delegate;
        ObservedPlainFactory(ConnectionSocketFactory delegate) { this.delegate = delegate; }
        @Override public Socket createSocket(HttpContext context) throws IOException {
            var measurement = TextureDiagnosticsClock.begin(); boolean completed = false;
            if (measurement == null) return delegate.createSocket(context);
            try {
                var socket = delegate.createSocket(context);
                // SDK 기본 공장은 평문 소켓을 만든 뒤 TLS를 입힌다. 예상 밖의 SSL 소켓은 조작하지 않는다.
                var observed = socket instanceof SSLSocket ? socket : new ObservedTcpSocket(socket);
                completed = true; return observed;
            } finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_SOCKET_CREATE, completed); }
        }
        @Override public Socket connectSocket(int timeout, Socket socket, HttpHost host, InetSocketAddress remote,
                                             InetSocketAddress local, HttpContext context) throws IOException {
            return delegate.connectSocket(timeout, socket, host, remote, local, context);
        }
    }

    /** HTTPS와 프록시의 layered 연결 모두 원래 SDK 공장을 사용한다. */
    static final class ObservedSocketFactory extends ObservedPlainFactory implements LayeredConnectionSocketFactory {
        private final LayeredConnectionSocketFactory layered;
        ObservedSocketFactory(LayeredConnectionSocketFactory delegate) { super(delegate); this.layered = delegate; }
        @Override public Socket createLayeredSocket(Socket socket, String host, int port, HttpContext context) throws IOException {
            return layered.createLayeredSocket(socket, host, port, context);
        }
    }

    /** SSL 소켓 생성과 실제 협상을 나눈다. 모든 생성 인수와 암호군은 원래 공장으로 전달한다. */
    static final class ObservedSslFactory extends SSLSocketFactory {
        private final SSLSocketFactory delegate;
        ObservedSslFactory(SSLSocketFactory delegate) { this.delegate = delegate; }
        private Socket create(IoSocket operation) throws IOException {
            var measurement = TextureDiagnosticsClock.begin(); boolean completed = false;
            if (measurement == null) return operation.get();
            try {
                var socket = operation.get();
                var observed = socket instanceof SSLSocket ssl ? new ObservedTlsSocket(ssl) : socket;
                completed = true; return observed;
            } finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_TLS_SOCKET_CREATE, completed); }
        }
        @Override public String[] getDefaultCipherSuites() { return delegate.getDefaultCipherSuites(); }
        @Override public String[] getSupportedCipherSuites() { return delegate.getSupportedCipherSuites(); }
        @Override public Socket createSocket() throws IOException { return create(delegate::createSocket); }
        @Override public Socket createSocket(Socket socket, String host, int port, boolean close) throws IOException { return create(() -> delegate.createSocket(socket, host, port, close)); }
        @Override public Socket createSocket(String host, int port) throws IOException { return create(() -> delegate.createSocket(host, port)); }
        @Override public Socket createSocket(String host, int port, InetAddress local, int localPort) throws IOException { return create(() -> delegate.createSocket(host, port, local, localPort)); }
        @Override public Socket createSocket(InetAddress host, int port) throws IOException { return create(() -> delegate.createSocket(host, port)); }
        @Override public Socket createSocket(InetAddress host, int port, InetAddress local, int localPort) throws IOException { return create(() -> delegate.createSocket(host, port, local, localPort)); }
        @Override public Socket createSocket(Socket socket, InputStream consumed, boolean close) throws IOException { return create(() -> delegate.createSocket(socket, consumed, close)); }
        @FunctionalInterface private interface IoSocket { Socket get() throws IOException; }
    }

    /** TLS 검증/협상을 원래 소켓에 위임한다. SDK의 기본 위임 소켓에 빠진 Java 17 접근자도 위임한다. */
    static final class ObservedTlsSocket extends DelegateSslSocket {
        ObservedTlsSocket(SSLSocket delegate) { super(delegate); }
        @Override public void startHandshake() throws IOException {
            var measurement = TextureDiagnosticsClock.begin(); boolean completed = false;
            try { sock.startHandshake(); completed = true; }
            finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_TLS_HANDSHAKE, completed); }
        }
        @Override public SSLParameters getSSLParameters() { return sock.getSSLParameters(); }
        @Override public void setSSLParameters(SSLParameters parameters) { sock.setSSLParameters(parameters); }
        @Override public SSLSession getHandshakeSession() { return sock.getHandshakeSession(); }
        @Override public String getApplicationProtocol() { return sock.getApplicationProtocol(); }
        @Override public String getHandshakeApplicationProtocol() { return sock.getHandshakeApplicationProtocol(); }
        @Override public void setHandshakeApplicationProtocolSelector(BiFunction<SSLSocket, List<String>, String> selector) { sock.setHandshakeApplicationProtocolSelector(selector); }
        @Override public BiFunction<SSLSocket, List<String>, String> getHandshakeApplicationProtocolSelector() { return sock.getHandshakeApplicationProtocolSelector(); }
        @Override public <T> Socket setOption(SocketOption<T> option, T value) throws IOException { sock.setOption(option, value); return this; }
        @Override public <T> T getOption(SocketOption<T> option) throws IOException { return sock.getOption(option); }
        @Override public Set<SocketOption<?>> supportedOptions() { return sock.supportedOptions(); }
    }

    /** 주소/인증서 내용을 기록하지 않고 기존 검증기의 판정과 예외를 그대로 사용한다. */
    static final class ObservedHostnameVerifier implements HostnameVerifier {
        private final HostnameVerifier delegate;
        ObservedHostnameVerifier(HostnameVerifier delegate) { this.delegate = delegate; }
        @Override public boolean verify(String host, SSLSession session) {
            var measurement = TextureDiagnosticsClock.begin(); boolean completed = false;
            try { boolean valid = delegate.verify(host, session); completed = true; return valid; }
            finally { TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_TLS_HOSTNAME_VERIFY, completed); }
        }
    }
}
