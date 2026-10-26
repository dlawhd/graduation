package shop.esjh.memoryjar.monitoring;

import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.interceptor.ExecutionAttributes;
import static org.assertj.core.api.Assertions.*;

/** SDK 요청/응답 원문 없이 공개 콜백 순서·실패 정리·중첩/다른 스레드의 기록 격리를 검사한다. */
class TextureS3ExecutionDiagnosticsTest {
    private final TextureS3ExecutionDiagnostics observer = new TextureS3ExecutionDiagnostics();
    private final ExecutionAttributes attributes = new ExecutionAttributes();
    private LoginDiagnostics enabled() { return new LoginDiagnostics(false, false, true, () -> null); }

    @Test void completeLifecycleRecordsEntryPreparationResponseAndReturnSeparately() {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try { assertThat(TextureS3ExecutionDiagnostics.call(() -> { callbacks(); return 7; })).isEqualTo(7); }
        finally { diagnostics.finish(attempt, 200, true); }
        var sdk = diagnostics.snapshot().textures().recent().get(0).s3Sdk();
        assertThat(sdk.durations()).containsKeys(LoginDiagnostics.S3SdkDuration.SDK_CALL_ENTRY,
                LoginDiagnostics.S3SdkDuration.SDK_BEFORE_MARSHALLING, LoginDiagnostics.S3SdkDuration.SDK_MARSHALLING_PIPELINE,
                LoginDiagnostics.S3SdkDuration.SDK_PRE_TRANSMISSION, LoginDiagnostics.S3SdkDuration.SDK_POST_TRANSMISSION,
                LoginDiagnostics.S3SdkDuration.SDK_UNMARSHALLING_PIPELINE, LoginDiagnostics.S3SdkDuration.SDK_AFTER_UNMARSHALLING,
                LoginDiagnostics.S3SdkDuration.SDK_RETURN, LoginDiagnostics.S3SdkDuration.SDK_GET_OBJECT);
        assertThat(sdk.counters().get(LoginDiagnostics.S3SdkCounter.SDK_PHASE_OBSERVER)).containsExactly(1);
        assertThat(sdk.counters()).doesNotContainKey(LoginDiagnostics.S3SdkCounter.SDK_PHASE_INCOMPLETE);
    }

    @Test void failureIsOriginalAndDoesNotLeaveThreadStateForNextRequest() {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        var original = new IllegalStateException("fixture private-error");
        try { assertThatThrownBy(() -> TextureS3ExecutionDiagnostics.call(() -> { observer.beforeExecution(null, attributes); throw original; })).isSameAs(original); }
        finally { diagnostics.finish(attempt, 502, false); }
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().counters())
                .containsKey(LoginDiagnostics.S3SdkCounter.SDK_PHASE_INCOMPLETE);
        var next = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try { TextureS3ExecutionDiagnostics.call(() -> { callbacks(); return true; }); }
        finally { diagnostics.finish(next, 200, true); }
        assertThat(diagnostics.snapshot().textures().recent().get(1).s3Sdk().counters())
                .doesNotContainKey(LoginDiagnostics.S3SdkCounter.SDK_PHASE_INCOMPLETE);
    }

    @Test void disabledNestedAndOtherThreadCallbacksCannotMasqueradeAsCleanSingleAttempt() throws Exception {
        assertThat(TextureS3ExecutionDiagnostics.call(() -> 3)).isEqualTo(3);
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try {
            TextureS3ExecutionDiagnostics.call(() -> {
                TextureS3ExecutionDiagnostics.call(() -> { callbacks(); return true; }); callbacks(); return true;
            });
        } finally { diagnostics.finish(attempt, 200, true); }
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().counters()
                .get(LoginDiagnostics.S3SdkCounter.SDK_PHASE_INCOMPLETE)).containsExactly(1);
        var next = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE); var workers = Executors.newSingleThreadExecutor();
        try { TextureS3ExecutionDiagnostics.call(() -> { try { workers.submit(this::callbacks).get(); } catch (Exception failure) { throw new RuntimeException(failure); } return true; }); }
        finally { workers.shutdownNow(); diagnostics.finish(next, 200, true); }
        assertThat(diagnostics.snapshot().textures().recent().get(1).s3Sdk().durations())
                .doesNotContainKey(LoginDiagnostics.S3SdkDuration.SDK_CALL_ENTRY);
    }

    @Test void repeatedOrOutOfOrderCallbacksAreExplicitlyMarkedIncomplete() {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        try { TextureS3ExecutionDiagnostics.call(() -> { observer.beforeTransmission(null, attributes); callbacks(); callbacks(); return true; }); }
        finally { diagnostics.finish(attempt, 200, true); }
        assertThat(diagnostics.snapshot().textures().recent().get(0).s3Sdk().counters()
                .get(LoginDiagnostics.S3SdkCounter.SDK_PHASE_INCOMPLETE)).containsExactly(1);
    }

    private void callbacks() {
        observer.beforeExecution(null, attributes); observer.beforeMarshalling(null, attributes); observer.afterMarshalling(null, attributes);
        observer.beforeTransmission(null, attributes); observer.afterTransmission(null, attributes); observer.beforeUnmarshalling(null, attributes);
        observer.afterUnmarshalling(null, attributes); observer.afterExecution(null, attributes);
    }
}
