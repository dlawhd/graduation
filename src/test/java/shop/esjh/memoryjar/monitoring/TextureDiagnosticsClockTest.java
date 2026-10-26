package shop.esjh.memoryjar.monitoring;

import java.lang.management.ManagementFactory;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

/** CPU 계측의 미지원/잘못된 값과 다른 스레드/요청을 거절하고 JVM 설정을 바꾸지 않는지 검사한다. */
class TextureDiagnosticsClockTest {
    private LoginDiagnostics enabled() { return new LoginDiagnostics(false, false, true, () -> null); }

    @Test void disabledRequestDoesNotCreateMeasurementOrChangeCpuSetting() {
        var bean = ManagementFactory.getThreadMXBean(); boolean before = bean.isThreadCpuTimeEnabled();
        assertThat(TextureDiagnosticsClock.begin()).isNull(); TextureDiagnosticsClock.cpu();
        assertThat(bean.isThreadCpuTimeEnabled()).isEqualTo(before);
    }

    @Test void onlyValidCpuDeltasAreStoredAndSnapshotIsImmutable() {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            TextureDiagnosticsClock.recordCpu(attempt, LoginDiagnostics.S3SdkDuration.HTTP_CONNECT, 100L, 120L);
            TextureDiagnosticsClock.recordCpu(attempt, LoginDiagnostics.S3SdkDuration.HTTP_CONNECT, null, 130L);
            TextureDiagnosticsClock.recordCpu(attempt, LoginDiagnostics.S3SdkDuration.HTTP_CONNECT, 140L, 130L);
        } finally { diagnostics.finish(attempt, 200, true); }
        var cpu = diagnostics.snapshot().textures().recent().get(0).s3Sdk().cpuDurations();
        assertThat(cpu.get(LoginDiagnostics.S3SdkDuration.HTTP_CONNECT).totalNanos()).isEqualTo(20);
        assertThat(cpu.get(LoginDiagnostics.S3SdkDuration.HTTP_CONNECT).count()).isEqualTo(1);
        assertThatThrownBy(cpu::clear).isInstanceOf(UnsupportedOperationException.class);
        TextureDiagnosticsClock.recordCpu(attempt, LoginDiagnostics.S3SdkDuration.HTTP_CONNECT, 0L, 100L);
        assertThat(cpu.get(LoginDiagnostics.S3SdkDuration.HTTP_CONNECT).count()).isEqualTo(1);
    }

    @Test void otherThreadCannotFinishOwnersMeasurement() throws Exception {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        var workers = Executors.newSingleThreadExecutor();
        try {
            var measurement = TextureDiagnosticsClock.begin();
            workers.submit(() -> TextureDiagnosticsClock.finish(measurement, LoginDiagnostics.S3SdkDuration.HTTP_CONNECT, true)).get(2, TimeUnit.SECONDS);
        } finally { workers.shutdownNow(); diagnostics.finish(attempt, 200, true); }
        var sdk = diagnostics.snapshot().textures().recent().get(0).s3Sdk();
        assertThat(sdk.durations()).isEmpty(); assertThat(sdk.cpuDurations()).isEmpty();
    }
}
