package shop.esjh.memoryjar.compat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;
import org.junit.platform.launcher.listeners.SummaryGeneratingListener;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;

/** 내부 Docker 네트워크의 임시 DB만 준비하고 옛 앱의 실제 HTTP 호환 시험을 실행한다. */
public final class LegacyCompatibilityLauncher {
    /** 외부 접근 차단과 전용 DB 주소를 확인한 뒤 V51 또는 V53 구조를 실제 Flyway로 만든다. */
    public static void main(String[] args) throws Exception {
        if (!"1".equals(System.getenv("ISOLATED_LEGACY_COMPAT"))) throw new IllegalStateException("Isolated runner required");
        String schema = System.getenv("COMPAT_SCHEMA_VERSION");
        if (!java.util.Set.of("51", "53").contains(schema)) throw new IllegalArgumentException("Unsupported schema");
        String url = System.getenv("SPRING_DATASOURCE_URL");
        if (!"jdbc:mariadb://db:3306/legacy_compat".equals(url)) throw new IllegalStateException("Disposable DB required");
        verifyNetworkIsolation();
        Flyway.configure().dataSource(url, System.getenv("SPRING_DATASOURCE_USERNAME"),
                        System.getenv("SPRING_DATASOURCE_PASSWORD"))
                .locations("filesystem:/schema").target(schema).load().migrate();
        var listener = new SummaryGeneratingListener();
        var launcher = LauncherFactory.create();
        launcher.registerTestExecutionListeners(listener);
        launcher.execute(LauncherDiscoveryRequestBuilder.request()
                .selectors(selectClass(LegacyBackendCompatibilityTest.class)).build());
        var result = listener.getSummary();
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("schemaVersion", Integer.parseInt(schema));
        report.put("backendCommit", "c5f58c4f7440122acba040aa5ab2042284e53987");
        report.put("testsFound", result.getTestsFoundCount());
        report.put("testsSucceeded", result.getTestsSucceededCount());
        report.put("testsFailed", result.getTestsFailedCount());
        report.put("testsSkipped", result.getTestsSkippedCount());
        report.put("networkIsolationVerified", true);
        report.put("failures", result.getFailures().stream().map(f -> Map.of(
                "test", f.getTestIdentifier().getDisplayName(), "exceptionType", f.getException().getClass().getName())).toList());
        // 응답·좌표·비밀번호·토큰·예외 원문은 공개 가능한 숫자 요약에 넣지 않는다.
        Files.writeString(Path.of("/results/result.json"), new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(report));
        try (var writer = new PrintWriter(Files.newBufferedWriter(Path.of("/results/private-junit.txt")))) {
            result.printTo(writer);
            result.printFailuresTo(writer);
        }
        boolean ok = result.getTestsSucceededCount() == 7 && result.getTotalFailureCount() == 0 && result.getTestsSkippedCount() == 0;
        System.out.println("LEGACY_COMPAT schema=" + schema + " passed=" + result.getTestsSucceededCount() + " status=" + (ok ? "PASS" : "FAIL"));
        System.exit(ok ? 0 : 1);
    }

    /** 운영 주소·AWS 메타데이터와 통신할 수 없는 컨테이너에서만 시험을 허용한다. */
    private static void verifyNetworkIsolation() throws Exception {
        boolean defaultRoute = Files.readAllLines(Path.of("/proc/net/route")).stream().skip(1)
                .map(line -> line.trim().split("\\s+"))
                .anyMatch(parts -> parts.length > 1 && parts[1].equals("00000000"));
        if (defaultRoute) throw new IllegalStateException("External default route exists");
        for (String address : java.util.List.of("1.1.1.1", "8.8.8.8", "52.78.116.71", "169.254.169.254", "2606:4700:4700::1111")) {
            boolean reached = false;
            try (var socket = new Socket()) {
                socket.connect(new InetSocketAddress(InetAddress.getByName(address), address.startsWith("169.") ? 80 : 443), 500);
                reached = true;
            } catch (java.io.IOException expected) { /* 내부 전용 네트워크에서는 외부 연결이 실패해야 한다. */ }
            if (reached) throw new IllegalStateException("External network is reachable");
        }
    }
}
