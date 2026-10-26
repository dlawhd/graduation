package shop.esjh.memoryjar.monitoring;

import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;

/** 로컬 요청의 경과 시간과 현재 스레드 CPU 사용을 짝지어 관찰한다. JVM의 계측 설정은 변경하지 않는다. */
final class TextureDiagnosticsClock {
    private static final ThreadMXBean CPU = ManagementFactory.getThreadMXBean();
    private TextureDiagnosticsClock() { }

    /** 요청 첫 구간에서 관리 API 클래스 초기화 비용을 섞지 않도록 로컬 클라이언트 준비 때 호출한다. */
    static void initialize() { /* 클래스 초기화만 수행하며 CPU 계측을 강제로 활성화하지 않는다. */ }

    static Measurement begin() {
        var owner = LoginDiagnostics.textureSdkOwner();
        return owner == null ? null : new Measurement(owner, System.nanoTime(), cpu());
    }

    static Long cpu() {
        try {
            if (!CPU.isCurrentThreadCpuTimeSupported() || !CPU.isThreadCpuTimeEnabled()) return null;
            long nanos = CPU.getCurrentThreadCpuTime(); return nanos < 0 ? null : nanos;
        } catch (RuntimeException unavailable) { return null; }
    }

    static void finish(Measurement measurement, LoginDiagnostics.S3SdkDuration metric, boolean completed) {
        if (measurement == null || !LoginDiagnostics.ownsTextureSdk(measurement.owner())) return;
        LoginDiagnostics.recordTransport(measurement.owner(), metric, measurement.wall(), completed);
        recordCpu(measurement.owner(), metric, measurement.cpu(), cpu());
    }

    static void recordCpu(LoginDiagnostics.Attempt owner, LoginDiagnostics.S3SdkDuration metric, Long before, Long after) {
        if (before == null || after == null || after < before) return;
        try { LoginDiagnostics.recordS3CpuDuration(owner, metric, after - before); }
        catch (RuntimeException unavailable) { if (LoginDiagnostics.ownsTextureSdk(owner)) owner.s3Truncated = true; }
    }

    /** 스레드/요청이 달라지면 끝 기록을 거절할 수 있도록 소유 요청과 숫자만 보유한다. */
    record Measurement(LoginDiagnostics.Attempt owner, long wall, Long cpu) { }
}
