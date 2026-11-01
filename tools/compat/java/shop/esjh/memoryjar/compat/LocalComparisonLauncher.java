package shop.esjh.memoryjar.compat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import org.flywaydb.core.Flyway;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;
import org.junit.platform.launcher.listeners.SummaryGeneratingListener;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;

/** 내부 네트워크의 빈 V53 DB만 준비한다. 운영 주소·AWS 메타데이터 연결을 먼저 차단 확인한다. */
public final class LocalComparisonLauncher {
    /** 정해진 DB·두 소스 버전·격리 조건이 아니면 Spring을 시작하지 않는다. */
    public static void main(String[] args) throws Exception {
        String variant=System.getenv("COMPARISON_VARIANT");
        if(!"1".equals(System.getenv("ISOLATED_LOCAL_COMPARISON")) || !java.util.Set.of("before","after").contains(variant))
            throw new IllegalStateException("Local comparison runner required");
        String url=System.getenv("SPRING_DATASOURCE_URL");
        if(!"jdbc:mariadb://db:3306/legacy_compat".equals(url)) throw new IllegalStateException("Disposable DB required");
        verifyIsolation();
        Flyway.configure().dataSource(url,System.getenv("SPRING_DATASOURCE_USERNAME"),System.getenv("SPRING_DATASOURCE_PASSWORD"))
            .locations("filesystem:/schema").target("53").load().migrate();
        var listener=new SummaryGeneratingListener();
        var launcher=LauncherFactory.create();launcher.registerTestExecutionListeners(listener);
        launcher.execute(LauncherDiscoveryRequestBuilder.request().selectors(selectClass(LocalComparisonSessionTest.class)).build());
        var result=listener.getSummary();
        // 실패 원문은 시험 전용 파일에만 남긴다. 운영 정보는 이 JVM에 전달하지 않는다.
        try(var writer=new java.io.PrintWriter(Files.newBufferedWriter(Path.of("/session/result-"+variant+".txt")))) {
            result.printTo(writer);result.printFailuresTo(writer);
        }
        System.exit(result.getTestsSucceededCount()==1 && result.getTotalFailureCount()==0?0:1);
    }

    /** 외부 기본 경로가 없고 운영·공용·메타데이터 주소에 연결할 수 없는지 실행 전에 검사한다. */
    static void verifyIsolation() throws Exception {
        if(Files.readAllLines(Path.of("/proc/net/route")).stream().skip(1).map(s->s.trim().split("\\s+"))
            .anyMatch(p->p.length>1&&p[1].equals("00000000"))) throw new IllegalStateException("External route exists");
        for(String address:java.util.List.of("1.1.1.1","52.78.116.71","169.254.169.254","2606:4700:4700::1111")) {
            boolean reached=false;
            try(var socket=new Socket()) {
                socket.connect(new InetSocketAddress(InetAddress.getByName(address),address.startsWith("169.")?80:443),400);
                reached=true;
            } catch(java.io.IOException expected) { /* 연결 실패가 이 격리 시험의 정상 조건이다. */ }
            if(reached) throw new IllegalStateException("External access available");
        }
    }
}
