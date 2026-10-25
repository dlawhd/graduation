package shop.esjh.memoryjar.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.core.metrics.CoreMetric;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.http.ExecutableHttpRequest;
import software.amazon.awssdk.http.HttpExecuteRequest;
import software.amazon.awssdk.http.HttpExecuteResponse;
import software.amazon.awssdk.http.HttpMetric;
import software.amazon.awssdk.http.SdkHttpClient;
import software.amazon.awssdk.http.SdkHttpResponse;
import software.amazon.awssdk.metrics.MetricCollection;
import software.amazon.awssdk.metrics.MetricCollector;
import software.amazon.awssdk.metrics.MetricPublisher;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 실제 AWS/자격 증명/네트워크 없이 SDK 지표의 숫자 허용 목록과 요청별 격리를 검증한다. */
class TextureS3DiagnosticsTest {
    private final ObjectMapper json = new ObjectMapper();
    private LoginDiagnostics enabled() { return new LoginDiagnostics(false, false, true, () -> null); }
    private GetObjectRequest request() { return TextureS3Diagnostics.instrument(GetObjectRequest.builder().bucket("private-bucket").key("private-key.png")); }
    private MetricPublisher publisher(GetObjectRequest request) { return request.overrideConfiguration().orElseThrow().metricPublishers().get(0); }

    @Test void normalOrDisabledRequestsNeverAttachSdkMetrics() {
        assertThat(request().overrideConfiguration()).isEmpty();
        var disabled = new LoginDiagnostics(true, true);
        var attempt = disabled.start(LoginDiagnostics.RequestKind.JAR_DETAIL);
        try { assertThat(request().overrideConfiguration()).isEmpty(); }
        finally { disabled.finish(attempt, 200, true); }
    }

    @Test void collectsOnlyAllowedNumbersAndNeverSerializesPrivateSdkFields() throws Exception {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            var collector = MetricCollector.create("private-collection-name");
            collector.reportMetric(CoreMetric.SERVICE_ENDPOINT, URI.create("https://private.example/path?signature=private-signature"));
            collector.reportMetric(CoreMetric.AWS_REQUEST_ID, "private-request-id");
            collector.reportMetric(CoreMetric.ERROR_TYPE, "private-error-text");
            collector.reportMetric(CoreMetric.OPERATION_NAME, "private-operation");
            collector.reportMetric(CoreMetric.CREDENTIALS_FETCH_DURATION, Duration.ofMillis(4));
            collector.reportMetric(CoreMetric.RETRY_COUNT, 1);
            for (int i = 0; i < 2; i++) {
                var child = collector.createChild("private-attempt-name");
                child.reportMetric(CoreMetric.SIGNING_DURATION, Duration.ofMillis(3));
                child.reportMetric(CoreMetric.SERVICE_CALL_DURATION, Duration.ofMillis(10));
                child.createChild("private-http-name").reportMetric(HttpMetric.CONCURRENCY_ACQUIRE_DURATION, Duration.ofMillis(2));
            }
            publisher(request()).publish(collector.collect());
        } finally { diagnostics.finish(attempt, 200, true); }
        var sdk = diagnostics.snapshot().textures().recent().get(0).s3Sdk();
        assertThat(sdk.publications()).isEqualTo(1); assertThat(sdk.truncated()).isFalse();
        assertThat(sdk.durations().get(LoginDiagnostics.S3SdkDuration.CREDENTIALS_FETCH).totalNanos()).isEqualTo(4_000_000L);
        assertThat(sdk.durations().get(LoginDiagnostics.S3SdkDuration.SIGNING).count()).isEqualTo(2);
        assertThat(sdk.durations().get(LoginDiagnostics.S3SdkDuration.SIGNING).totalNanos()).isEqualTo(6_000_000L);
        assertThat(sdk.counters().get(LoginDiagnostics.S3SdkCounter.RETRY_COUNT)).containsExactly(1);
        assertThat(json.writeValueAsString(sdk)).doesNotContain("private-", "signature", "AWS_REQUEST_ID");
        assertThatThrownBy(() -> sdk.durations().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> sdk.counters().get(LoginDiagnostics.S3SdkCounter.RETRY_COUNT).clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test void missingMetricsStayMissingAndInvalidNumbersAreNotConvertedToZero() {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_BODY);
        try {
            var collector = MetricCollector.create("test");
            collector.reportMetric(CoreMetric.SIGNING_DURATION, Duration.ofNanos(-1));
            collector.reportMetric(CoreMetric.RETRY_COUNT, -1);
            publisher(request()).publish(collector.collect());
        } finally { diagnostics.finish(attempt, 200, true); }
        var sdk = diagnostics.snapshot().textures().recent().get(0).s3Sdk();
        assertThat(sdk.durations()).isEmpty(); assertThat(sdk.counters()).doesNotContainKey(LoginDiagnostics.S3SdkCounter.RETRY_COUNT);
    }

    @Test void staleOrDifferentThreadCallbacksCannotEnterAnotherRequest() throws Exception {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        var publisher = publisher(request());
        var collector = MetricCollector.create("test"); collector.reportMetric(CoreMetric.CREDENTIALS_FETCH_DURATION, Duration.ofMillis(1));
        var metrics = collector.collect(); var workers = Executors.newSingleThreadExecutor();
        try { workers.submit(() -> publisher.publish(metrics)).get(2, TimeUnit.SECONDS); }
        finally { workers.shutdownNow(); diagnostics.finish(attempt, 200, true); }
        publisher.publish(metrics);
        var next = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_BODY);
        try { publisher.publish(metrics); } finally { diagnostics.finish(next, 200, true); }
        assertThat(diagnostics.snapshot().textures().recent()).allSatisfy(sample -> assertThat(sample.s3Sdk().publications()).isZero());
    }

    @Test void sdkMetricFailureDoesNotChangeDownloadAndRetentionIsBounded() {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            var publisher = publisher(request()); var broken = mock(MetricCollection.class);
            when(broken.metricValues(any())).thenThrow(new IllegalStateException("private-sdk-error"));
            assertThatCode(() -> publisher.publish(broken)).doesNotThrowAnyException();
            var collector = MetricCollector.create("test");
            for (int i = 0; i < 100; i++) collector.reportMetric(CoreMetric.RETRY_COUNT, i);
            publisher.publish(collector.collect());
            for (int i = 0; i < 8; i++) publisher.publish(collector.collect());
        } finally { diagnostics.finish(attempt, 200, true); }
        var sdk = diagnostics.snapshot().textures().recent().get(0).s3Sdk();
        assertThat(sdk.truncated()).isTrue(); assertThat(sdk.publications()).isEqualTo(4);
        assertThat(sdk.counters().get(LoginDiagnostics.S3SdkCounter.RETRY_COUNT)).hasSize(32);
    }

    @Test void durationOverflowDoesNotEscapeObserverOrStorePrivateData() {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            var collector = MetricCollector.create("test");
            collector.reportMetric(CoreMetric.CREDENTIALS_FETCH_DURATION, Duration.ofSeconds(Long.MAX_VALUE));
            assertThatCode(() -> publisher(request()).publish(collector.collect())).doesNotThrowAnyException();
        } finally { diagnostics.finish(attempt, 200, true); }
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().truncated()).isTrue();
    }

    @Test void realSdkPublishesCredentialsAndHttpMetricsBeforeRequestFinishesWithoutNetwork() throws Exception {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        var credentialsCalls = new AtomicInteger();
        var http = mock(SdkHttpClient.class); var execution = mock(ExecutableHttpRequest.class);
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10};
        when(http.prepareRequest(any(HttpExecuteRequest.class))).thenAnswer(call -> {
            HttpExecuteRequest request = call.getArgument(0);
            request.metricCollector().orElseThrow().reportMetric(HttpMetric.CONCURRENCY_ACQUIRE_DURATION, Duration.ofMillis(2));
            return execution;
        });
        when(execution.call()).thenReturn(HttpExecuteResponse.builder().response(SdkHttpResponse.builder().statusCode(200)
                .putHeader("Content-Type", "image/png").putHeader("Content-Length", "8")
                .putHeader("x-amz-request-id", "private-request-id").build())
                .responseBody(AbortableInputStream.create(new ByteArrayInputStream(png))).build());
        try (var client = S3Client.builder().region(Region.US_EAST_1).endpointOverride(URI.create("https://s3.example.invalid"))
                .credentialsProvider(() -> { credentialsCalls.incrementAndGet(); return AwsBasicCredentials.create("fixture-id", "fixture-secret"); })
                .httpClient(http).build()) {
            try (var response = client.getObject(request())) { assertThat(response.readAllBytes()).isEqualTo(png); }
        } finally { diagnostics.finish(attempt, 200, true); }
        var sdk = diagnostics.snapshot().textures().recent().get(0).s3Sdk();
        assertThat(credentialsCalls).hasValue(1); assertThat(sdk.publications()).isEqualTo(1);
        assertThat(sdk.durations()).containsKeys(LoginDiagnostics.S3SdkDuration.API_CALL,
                LoginDiagnostics.S3SdkDuration.CREDENTIALS_FETCH, LoginDiagnostics.S3SdkDuration.SIGNING,
                LoginDiagnostics.S3SdkDuration.SERVICE_CALL, LoginDiagnostics.S3SdkDuration.CONNECTION_ACQUIRE);
        assertThat(sdk.counters().get(LoginDiagnostics.S3SdkCounter.RETRY_COUNT)).containsExactly(0);
        assertThat(json.writeValueAsString(sdk)).doesNotContain("fixture-id", "fixture-secret", "private-key", "private-bucket", "private-request-id", "example.invalid");
        verify(http, times(1)).prepareRequest(any(HttpExecuteRequest.class));
    }
}
