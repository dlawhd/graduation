package shop.esjh.memoryjar.monitoring;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.List;
import software.amazon.awssdk.core.metrics.CoreMetric;
import software.amazon.awssdk.http.HttpMetric;
import software.amazon.awssdk.metrics.MetricCollection;
import software.amazon.awssdk.metrics.MetricPublisher;
import software.amazon.awssdk.metrics.SdkMetric;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

/**
 * 로컬 이미지 요청에만 SDK의 수치 계측을 연결한다. 인증정보·객체 키·URL·응답·예외 원문을
 * 복사하거나 로그/CloudWatch로 보내지 않고, 현재 요청의 메모리 진단에 허용한 지표만 남긴다.
 */
public final class TextureS3Diagnostics {
    private TextureS3Diagnostics() { }

    /** 캐시 MISS의 실제 GetObject 한 요청만 관찰한다. 클라이언트·인증 제공자·재시도 정책은 바꾸지 않는다. */
    public static GetObjectRequest instrument(GetObjectRequest.Builder request) {
        var owner = LoginDiagnostics.textureSdkOwner();
        if (owner != null) request.overrideConfiguration(config -> config.addMetricPublisher(new SafePublisher(owner)));
        return request.build();
    }

    private record DurationMetric(SdkMetric<Duration> sdk, LoginDiagnostics.S3SdkDuration target) { }
    private record CounterMetric(SdkMetric<Integer> sdk, LoginDiagnostics.S3SdkCounter target) { }

    /** SDK가 전달한 숫자만 읽고 즉시 버리는 동기 관찰자다. 지연 콜백은 원래 요청과 다르면 버린다. */
    static final class SafePublisher implements MetricPublisher {
        private static final List<DurationMetric> DURATIONS = List.of(
                new DurationMetric(CoreMetric.API_CALL_DURATION, LoginDiagnostics.S3SdkDuration.API_CALL),
                new DurationMetric(CoreMetric.CREDENTIALS_FETCH_DURATION, LoginDiagnostics.S3SdkDuration.CREDENTIALS_FETCH),
                new DurationMetric(CoreMetric.TOKEN_FETCH_DURATION, LoginDiagnostics.S3SdkDuration.TOKEN_FETCH),
                new DurationMetric(CoreMetric.ENDPOINT_RESOLVE_DURATION, LoginDiagnostics.S3SdkDuration.ENDPOINT_RESOLVE),
                new DurationMetric(CoreMetric.MARSHALLING_DURATION, LoginDiagnostics.S3SdkDuration.MARSHALLING),
                new DurationMetric(CoreMetric.SIGNING_DURATION, LoginDiagnostics.S3SdkDuration.SIGNING),
                new DurationMetric(CoreMetric.SERVICE_CALL_DURATION, LoginDiagnostics.S3SdkDuration.SERVICE_CALL),
                new DurationMetric(CoreMetric.UNMARSHALLING_DURATION, LoginDiagnostics.S3SdkDuration.UNMARSHALLING),
                new DurationMetric(CoreMetric.TIME_TO_FIRST_BYTE, LoginDiagnostics.S3SdkDuration.TIME_TO_FIRST_BYTE),
                new DurationMetric(CoreMetric.TIME_TO_LAST_BYTE, LoginDiagnostics.S3SdkDuration.TIME_TO_LAST_BYTE),
                new DurationMetric(CoreMetric.BACKOFF_DELAY_DURATION, LoginDiagnostics.S3SdkDuration.BACKOFF_DELAY),
                new DurationMetric(HttpMetric.CONCURRENCY_ACQUIRE_DURATION, LoginDiagnostics.S3SdkDuration.CONNECTION_ACQUIRE));
        private static final List<CounterMetric> COUNTERS = List.of(
                new CounterMetric(CoreMetric.RETRY_COUNT, LoginDiagnostics.S3SdkCounter.RETRY_COUNT),
                new CounterMetric(HttpMetric.MAX_CONCURRENCY, LoginDiagnostics.S3SdkCounter.MAX_CONCURRENCY),
                new CounterMetric(HttpMetric.AVAILABLE_CONCURRENCY, LoginDiagnostics.S3SdkCounter.AVAILABLE_CONCURRENCY),
                new CounterMetric(HttpMetric.LEASED_CONCURRENCY, LoginDiagnostics.S3SdkCounter.LEASED_CONCURRENCY),
                new CounterMetric(HttpMetric.PENDING_CONCURRENCY_ACQUIRES, LoginDiagnostics.S3SdkCounter.PENDING_CONCURRENCY_ACQUIRES));
        private final LoginDiagnostics.Attempt owner;
        SafePublisher(LoginDiagnostics.Attempt owner) { this.owner = owner; }

        @Override public void publish(MetricCollection collection) {
            if (!LoginDiagnostics.ownsTextureSdk(owner) || collection == null) return;
            try {
                if (owner.s3Publications >= 4) { owner.s3Truncated = true; return; }
                owner.s3Publications++;
                var pending = new ArrayDeque<MetricCollection>(); pending.add(collection);
                int visited = 0;
                while (!pending.isEmpty() && visited++ < 64) {
                    var current = pending.removeFirst();
                    for (var metric : DURATIONS) {
                        var values = current.metricValues(metric.sdk());
                        if (values.size() > 32) owner.s3Truncated = true;
                        for (int i = 0; i < Math.min(values.size(), 32); i++) {
                            var value = values.get(i);
                            if (value != null && !value.isNegative()) LoginDiagnostics.recordS3Duration(owner, metric.target(), value.toNanos());
                        }
                    }
                    for (var metric : COUNTERS) {
                        var values = current.metricValues(metric.sdk());
                        if (values.size() > 32) owner.s3Truncated = true;
                        for (int i = 0; i < Math.min(values.size(), 32); i++) {
                            if (values.get(i) != null) LoginDiagnostics.recordS3Counter(owner, metric.target(), values.get(i));
                        }
                    }
                    // SDK의 내부 트리 이름/전체 iterator를 읽지 않아 요청 ID·키·URL 같은 문자열을 복사하지 않는다.
                    for (var child : current.children()) {
                        if (pending.size() < 64) pending.addLast(child); else owner.s3Truncated = true;
                    }
                }
                if (!pending.isEmpty()) owner.s3Truncated = true;
            } catch (RuntimeException unavailable) {
                // 부가 계측의 비정상 값/실패는 원래 다운로드 결과나 예외를 바꾸지 않는다.
                owner.s3Truncated = true;
            }
        }

        @Override public void close() { /* 외부 연결·파일·인증정보를 보유하지 않는다. */ }
    }
}
