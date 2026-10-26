package shop.esjh.memoryjar.monitoring;

import java.util.EnumMap;
import java.util.function.Supplier;
import software.amazon.awssdk.core.interceptor.Context;
import software.amazon.awssdk.core.interceptor.ExecutionAttributes;
import software.amazon.awssdk.core.interceptor.ExecutionInterceptor;

/**
 * SDK가 제공하는 공개 생명주기 콜백 사이의 숫자 시간만 관찰한다. 요청/응답/예외/인증정보는
 * 읽지 않는다. HTTP 시간과 겹칠 수 있는 SDK 진입·전처리·응답 해석 구간을 구분하기 위한 코드다.
 */
public final class TextureS3ExecutionDiagnostics implements ExecutionInterceptor {
    private static final ThreadLocal<Call> CURRENT = new ThreadLocal<>();
    private enum Marker { ENTER, EXECUTION, BEFORE_MARSHALL, AFTER_MARSHALL, TRANSMIT,
        RECEIVED, BEFORE_UNMARSHALL, AFTER_UNMARSHALL, DONE }

    /** 실제 GetObject 호출 전후에만 수명을 둔다. 꺼진 요청은 원래 작업만 실행하고, 예외도 바꾸지 않는다. */
    public static <T> T call(Supplier<T> operation) {
        var owner = LoginDiagnostics.textureSdkOwner();
        if (owner == null) return operation.get();
        // 같은 스레드의 중첩 SDK 호출을 새 요청처럼 덮어쓰지 않는다. 원래 호출과도 섞이지 않게 표시한다.
        if (CURRENT.get() != null) {
            var parent = CURRENT.get(); incomplete(parent); CURRENT.remove();
            try { return operation.get(); } finally { CURRENT.set(parent); }
        }
        var call = new Call(owner); CURRENT.set(call); boolean completed = false;
        try { T result = operation.get(); completed = true; return result; }
        finally {
            try {
                if (completed) span(call, Marker.DONE, System.nanoTime(), TextureDiagnosticsClock.cpu(), LoginDiagnostics.S3SdkDuration.SDK_RETURN);
                if (!completed || !call.times.containsKey(Marker.DONE)) incomplete(call);
                span(call, Marker.ENTER, System.nanoTime(), TextureDiagnosticsClock.cpu(), LoginDiagnostics.S3SdkDuration.SDK_GET_OBJECT);
            } finally { CURRENT.remove(); }
        }
    }

    @Override public void beforeExecution(Context.BeforeExecution context, ExecutionAttributes attributes) {
        mark(Marker.EXECUTION, Marker.ENTER, LoginDiagnostics.S3SdkDuration.SDK_CALL_ENTRY);
        var call = current();
        if (call != null) LoginDiagnostics.recordS3Counter(call.owner, LoginDiagnostics.S3SdkCounter.SDK_PHASE_OBSERVER, 1);
    }
    @Override public void beforeMarshalling(Context.BeforeMarshalling context, ExecutionAttributes attributes) {
        mark(Marker.BEFORE_MARSHALL, Marker.EXECUTION, LoginDiagnostics.S3SdkDuration.SDK_BEFORE_MARSHALLING);
    }
    @Override public void afterMarshalling(Context.AfterMarshalling context, ExecutionAttributes attributes) {
        mark(Marker.AFTER_MARSHALL, Marker.BEFORE_MARSHALL, LoginDiagnostics.S3SdkDuration.SDK_MARSHALLING_PIPELINE);
    }
    @Override public void beforeTransmission(Context.BeforeTransmission context, ExecutionAttributes attributes) {
        mark(Marker.TRANSMIT, Marker.AFTER_MARSHALL, LoginDiagnostics.S3SdkDuration.SDK_PRE_TRANSMISSION);
    }
    @Override public void afterTransmission(Context.AfterTransmission context, ExecutionAttributes attributes) {
        // 실제 전송 구간은 기존 SDK/HTTP 관찰자가 담당한다. 상위 시간과 섞어 더하지 않는다.
        mark(Marker.RECEIVED, null, null);
    }
    @Override public void beforeUnmarshalling(Context.BeforeUnmarshalling context, ExecutionAttributes attributes) {
        mark(Marker.BEFORE_UNMARSHALL, Marker.RECEIVED, LoginDiagnostics.S3SdkDuration.SDK_POST_TRANSMISSION);
    }
    @Override public void afterUnmarshalling(Context.AfterUnmarshalling context, ExecutionAttributes attributes) {
        mark(Marker.AFTER_UNMARSHALL, Marker.BEFORE_UNMARSHALL, LoginDiagnostics.S3SdkDuration.SDK_UNMARSHALLING_PIPELINE);
    }
    @Override public void afterExecution(Context.AfterExecution context, ExecutionAttributes attributes) {
        mark(Marker.DONE, Marker.AFTER_UNMARSHALL, LoginDiagnostics.S3SdkDuration.SDK_AFTER_UNMARSHALLING);
    }
    @Override public void onExecutionFailure(Context.FailedExecution context, ExecutionAttributes attributes) {
        var call = current(); if (call != null) incomplete(call);
    }

    private static Call current() {
        var call = CURRENT.get();
        return call != null && LoginDiagnostics.ownsTextureSdk(call.owner) ? call : null;
    }

    private static void mark(Marker marker, Marker from, LoginDiagnostics.S3SdkDuration metric) {
        var call = current(); if (call == null) return;
        try {
            long now = System.nanoTime();
            Long cpu = TextureDiagnosticsClock.cpu();
            // 재시도 등으로 같은 콜백이 반복되면 첫 호출 기록만 보관하고 완전한 단일 시도라고 해석하지 않는다.
            if (call.times.putIfAbsent(marker, now) != null) { incomplete(call); return; }
            if (cpu != null) call.cpu.put(marker, cpu);
            if (from != null) span(call, from, now, cpu, metric);
        } catch (RuntimeException unavailable) { incomplete(call); }
    }

    private static void span(Call call, Marker from, long end, Long cpu, LoginDiagnostics.S3SdkDuration metric) {
        var start = call.times.get(from);
        if (start == null) { incomplete(call); return; }
        try {
            LoginDiagnostics.recordS3Duration(call.owner, metric, Math.max(0, end - start));
            TextureDiagnosticsClock.recordCpu(call.owner, metric, call.cpu.get(from), cpu);
        }
        catch (RuntimeException unavailable) { incomplete(call); }
    }

    private static void incomplete(Call call) {
        if (!LoginDiagnostics.ownsTextureSdk(call.owner)) return;
        if (!call.incomplete) {
            call.incomplete = true;
            LoginDiagnostics.recordS3Counter(call.owner, LoginDiagnostics.S3SdkCounter.SDK_PHASE_INCOMPLETE, 1);
        }
    }

    /** 현재 GetObject가 반환/실패하면 제거되는 숫자 표식이다. 사용자 데이터는 보유하지 않는다. */
    private static final class Call {
        final LoginDiagnostics.Attempt owner;
        final EnumMap<Marker, Long> times = new EnumMap<>(Marker.class);
        final EnumMap<Marker, Long> cpu = new EnumMap<>(Marker.class);
        boolean incomplete;
        Call(LoginDiagnostics.Attempt owner) {
            this.owner = owner; times.put(Marker.ENTER, System.nanoTime());
            var start = TextureDiagnosticsClock.cpu(); if (start != null) cpu.put(Marker.ENTER, start);
        }
    }
}
