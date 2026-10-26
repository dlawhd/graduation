package shop.esjh.memoryjar.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.StandardSocketOptions;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executors;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.apache.http.conn.DnsResolver;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 실제 외부 접속 없이 DNS/TCP/TLS 위임과 소유 요청 분리·원문 비보관을 검증한다. */
class TextureSocketDiagnosticsTest {
    private LoginDiagnostics enabled() { return new LoginDiagnostics(false, false, true, () -> null); }

    @Test void dnsPreservesReturnedArrayAndOriginalExceptionWithoutStoringHost() throws Exception {
        var original = mock(DnsResolver.class); var observer = new TextureSocketDiagnostics.ObservedDns(original);
        var addresses = new InetAddress[]{InetAddress.getLoopbackAddress()};
        when(original.resolve("private-host")).thenReturn(addresses);
        var failure = new UnknownHostException("private-name"); when(original.resolve("invalid-host")).thenThrow(failure);
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            assertThat(observer.resolve("private-host")).isSameAs(addresses);
            assertThatThrownBy(() -> observer.resolve("invalid-host")).isSameAs(failure);
        } finally { diagnostics.finish(attempt, 502, false); }
        var sdk = diagnostics.snapshot().textures().recent().get(0).s3Sdk();
        assertThat(sdk.durations().get(LoginDiagnostics.S3SdkDuration.HTTP_DNS).count()).isEqualTo(2);
        assertThat(new ObjectMapper().writeValueAsString(sdk)).doesNotContain("private-", "invalid-host");
    }

    @Test void tcpKeepsTimeoutSocketOptionsStreamsAndCloseOnOriginalSocket() throws Exception {
        var original = mock(Socket.class); var observer = new TextureSocketDiagnostics.ObservedTcpSocket(original);
        var endpoint = new InetSocketAddress(InetAddress.getLoopbackAddress(), 1234);
        var input = new ByteArrayInputStream(new byte[]{1}); when(original.getInputStream()).thenReturn(input);
        when(original.supportedOptions()).thenReturn(Set.of(StandardSocketOptions.SO_KEEPALIVE));
        when(original.getOption(StandardSocketOptions.SO_KEEPALIVE)).thenReturn(true);
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            observer.connect(endpoint, 4321);
            assertThat(observer.getInputStream()).isSameAs(input);
            assertThat(observer.setOption(StandardSocketOptions.SO_KEEPALIVE, true)).isSameAs(observer);
            assertThat(observer.getOption(StandardSocketOptions.SO_KEEPALIVE)).isTrue();
            assertThat(observer.supportedOptions()).containsExactly(StandardSocketOptions.SO_KEEPALIVE);
            observer.close();
        } finally { diagnostics.finish(attempt, 200, true); }
        verify(original).connect(same(endpoint), eq(4321)); verify(original).close();
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().durations())
                .containsKey(LoginDiagnostics.S3SdkDuration.HTTP_TCP_CONNECT);
    }

    @Test void tlsFactoryAndSocketKeepSslParametersSessionsProtocolsAndOriginalHandshake() throws Exception {
        var original = mock(SSLSocketFactory.class); var ssl = mock(SSLSocket.class); var plain = mock(Socket.class);
        var session = mock(SSLSession.class); var parameters = new SSLParameters(new String[]{"fixture-cipher"});
        when(original.createSocket(plain, "private-host", 443, true)).thenReturn(ssl);
        when(ssl.getSession()).thenReturn(session); when(ssl.getHandshakeSession()).thenReturn(session);
        when(ssl.getSSLParameters()).thenReturn(parameters); when(ssl.getApplicationProtocol()).thenReturn("fixture-protocol");
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            var observed = (SSLSocket) new TextureSocketDiagnostics.ObservedSslFactory(original).createSocket(plain, "private-host", 443, true);
            assertThat(observed).isInstanceOf(TextureSocketDiagnostics.ObservedTlsSocket.class);
            assertThat(observed.getSession()).isSameAs(session); assertThat(observed.getHandshakeSession()).isSameAs(session);
            assertThat(observed.getSSLParameters()).isSameAs(parameters); observed.setSSLParameters(parameters);
            assertThat(observed.getApplicationProtocol()).isEqualTo("fixture-protocol");
            observed.startHandshake(); observed.close();
        } finally { diagnostics.finish(attempt, 200, true); }
        verify(original).createSocket(same(plain), eq("private-host"), eq(443), eq(true));
        verify(ssl).setSSLParameters(same(parameters)); verify(ssl).startHandshake(); verify(ssl).close();
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().durations())
                .containsKeys(LoginDiagnostics.S3SdkDuration.HTTP_TLS_SOCKET_CREATE, LoginDiagnostics.S3SdkDuration.HTTP_TLS_HANDSHAKE);
    }

    @Test void hostnameDecisionAndTlsFailureAreNotChanged() throws Exception {
        var verifier = mock(HostnameVerifier.class); var session = mock(SSLSession.class);
        when(verifier.verify("private-host", session)).thenReturn(false);
        var socket = mock(SSLSocket.class); var original = new IOException("private-handshake-failure"); doThrow(original).when(socket).startHandshake();
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            assertThat(new TextureSocketDiagnostics.ObservedHostnameVerifier(verifier).verify("private-host", session)).isFalse();
            assertThatThrownBy(() -> new TextureSocketDiagnostics.ObservedTlsSocket(socket).startHandshake()).isSameAs(original);
        } finally { diagnostics.finish(attempt, 502, false); }
        verify(verifier).verify(same("private-host"), same(session));
        assertThat(new ObjectMapper().writeValueAsString(diagnostics.snapshot())).doesNotContain("private-");
    }

    @Test void anotherThreadAndNonTextureRequestsCannotRecordSocketMetrics() throws Exception {
        var dns = new TextureSocketDiagnostics.ObservedDns(host -> new InetAddress[]{InetAddress.getLoopbackAddress()});
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        var workers = Executors.newSingleThreadExecutor();
        try { workers.submit(() -> dns.resolve("private-host")).get(); }
        finally { workers.shutdownNow(); diagnostics.finish(attempt, 200, true); }
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().durations()).isEmpty();
        var normal = new LoginDiagnostics(true, true); var other = normal.start(LoginDiagnostics.RequestKind.JAR_DETAIL);
        try { dns.resolve("private-host"); } finally { normal.finish(other, 200, true); }
        assertThat(normal.snapshot().reads().recent().get(0).s3Sdk().durations()).isEmpty();
    }
}
