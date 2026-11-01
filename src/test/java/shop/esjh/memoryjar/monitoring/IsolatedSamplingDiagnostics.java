package shop.esjh.memoryjar.monitoring;

import java.util.concurrent.atomic.AtomicLong;

/** 격리 진단에서만 요청 10개 중 1개에 기존 상세 계측을 붙여 관찰 자체의 CPU·GC 비용을 제한한다. */
public final class IsolatedSamplingDiagnostics extends LoginDiagnostics {
    private final AtomicLong sequence = new AtomicLong();

    public IsolatedSamplingDiagnostics() {
        super(false, true);
        if (!"1".equals(System.getenv("ISOLATED_READ_PROBE")) || !"1".equals(System.getenv("ISOLATED_E2E")))
            throw new IllegalStateException("Sampling diagnostics require isolated test flags");
    }

    @Override Attempt start(RequestKind kind) {
        return sequence.incrementAndGet() % 10 == 0 ? super.start(kind) : null;
    }
}
