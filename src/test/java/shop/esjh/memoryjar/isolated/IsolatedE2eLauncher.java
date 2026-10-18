package shop.esjh.memoryjar.isolated;

import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;
import org.junit.platform.launcher.listeners.SummaryGeneratingListener;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;

/** Docker 내부에서만 E2E를 실행한다. Gradle 캐시나 Docker 소켓을 시험 JVM에 전달하지 않는다. */
public final class IsolatedE2eLauncher {
    public static void main(String[] args) throws Exception {
        if (!"1".equals(System.getenv("ISOLATED_E2E"))) {
            throw new IllegalStateException("Use tools/isolated/run-e2e.ps1");
        }
        // 네트워크 격리를 먼저 확인한다. 실패하면 애플리케이션 자체를 시작하지 않는다.
        IsolatedHttpWebSocketTest.verifyEgressBlocked();
        Files.writeString(Path.of("/results/egress.txt"),
                "PASS: no IPv4 default route; public IPv4/IPv6 and metadata TCP blocked\n"
                        + "Java=" + System.getProperty("java.version") + "\n"
                        + "Scope=isolated runner container only; DNS/host firewall not tested\n");
        var listener = new SummaryGeneratingListener();
        boolean readPreflight = "1".equals(System.getenv("ISOLATED_READ_PREFLIGHT"));
        var launcher = LauncherFactory.create();
        launcher.registerTestExecutionListeners(listener);
        launcher.execute(LauncherDiscoveryRequestBuilder.request()
                .selectors(selectClass(readPreflight ? IsolatedReadScenarioTest.class : IsolatedHttpWebSocketTest.class)).build());
        var summary = listener.getSummary();
        try (var writer = new PrintWriter(Files.newBufferedWriter(Path.of("/results/summary.txt")))) {
            summary.printTo(writer);
            summary.printFailuresTo(writer);
        }
        summary.printTo(new PrintWriter(System.out, true));
        summary.printFailuresTo(new PrintWriter(System.out, true));
        // 컨텍스트 초기화 실패나 전부 skip도 성공으로 취급하지 않는다.
        System.exit(summary.getTotalFailureCount() == 0 && summary.getTestsSucceededCount() == (readPreflight ? 1 : 4) ? 0 : 1);
    }
}
