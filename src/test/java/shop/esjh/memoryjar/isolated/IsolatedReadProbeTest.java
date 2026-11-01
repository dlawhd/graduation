package shop.esjh.memoryjar.isolated;

import org.junit.jupiter.api.Test;
import java.util.List;
import java.nio.file.Path;
import java.nio.file.Files;
import jdk.jfr.Recording;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.assertThat;

/** 진단 단계명이 결과 폴더 밖 경로나 임의 문자열로 바뀌지 않는지 확인한다. 서버·DB는 시작하지 않는다. */
class IsolatedReadProbeTest {
    /** 실제 JFR 파일 형식으로 할당 집계의 단위와 HTTP 스레드 필터를 검사하는 가짜 이벤트다. */
    @jdk.jfr.Name("jdk.ObjectAllocationSample")
    static class AllocationSample extends jdk.jfr.Event {
        Class<?> objectClass;
        long weight;
    }

    @Test void summarizesAllocationWeightsWithoutObjectValues(@TempDir Path directory) throws Exception {
        Path file = directory.resolve("allocation.jfr"), output = directory.resolve("allocation.json");
        try (var recording = new Recording()) {
            recording.setSettings(java.util.Map.of());
            recording.enable(AllocationSample.class).withStackTrace();
            recording.start();
            var http = new Thread(() -> {
                var event = new AllocationSample(); event.objectClass = byte[].class; event.weight = 1234;
                event.commit();
            }, "http-nio-8080-exec-1");
            http.start(); http.join();
            var excluded = new AllocationSample(); excluded.objectClass = String.class; excluded.weight = 9876;
            excluded.commit();
            recording.stop(); recording.dump(file);
        }
        var mapper = new ObjectMapper();
        IsolatedReadProbe.summarizeRecording(mapper, file, output);
        var result = mapper.readTree(Files.readString(output));
        assertThat(result.path("httpAllocationSamples").asLong()).isEqualTo(1);
        assertThat(result.path("httpAllocationWeightBytes").asLong()).isEqualTo(1234);
        assertThat(result.path("allocationClassWeightBytes").path("[B").asLong()).isEqualTo(1234);
        assertThat(result.path("allocationClassWeightBytes").has("java.lang.String")).isFalse();
    }

    @Test void waitsForNewImmutableCommandsInsteadOfFailingOnMissingFiles(@TempDir Path directory) throws Exception {
        var mapper = new ObjectMapper(); var first = directory.resolve("probe-command-00001.json");
        assertThat(IsolatedReadProbe.readControl(mapper, first)).isNull();
        Files.writeString(first, "{\"phase\":\"json-a1\",\"active\":true}");
        assertThat(IsolatedReadProbe.readControl(mapper, first).path("active").asBoolean()).isTrue();
        assertThat(IsolatedReadProbe.readControl(mapper, directory.resolve("probe-command-00002.json"))).isNull();
        assertThat(IsolatedReadProbe.readControl(mapper, first).path("phase").asText()).isEqualTo("json-a1");
    }
    @Test void excludesNativeAndManagementThreadsWithoutJavaNames() {
        assertThat(IsolatedReadProbe.isHttpThreadName(null)).isFalse();
        assertThat(IsolatedReadProbe.isHttpThreadName("GC Thread#0")).isFalse();
        assertThat(IsolatedReadProbe.isHttpThreadName("http-nio-9091-exec-1")).isFalse();
        assertThat(IsolatedReadProbe.isHttpThreadName("http-nio-8080-exec-12")).isTrue();
        assertThat(IsolatedReadProbe.isHttpThreadName("http-nio-0.0.0.0-8080-exec-12")).isTrue();
    }
    @Test void normalizesV1AndV2CpuCountersToTheSameUnit() {
        var old = IsolatedReadProbe.normalizeCpuStats(List.of("nr_periods 100", "nr_throttled 20", "throttled_time 123456000"), "987654000");
        var current = IsolatedReadProbe.normalizeCpuStats(List.of("nr_periods 100", "nr_throttled 20", "throttled_usec 123456", "usage_usec 987654"), null);
        assertThat(old).isEqualTo(current);
    }

    /** 격리 컨테이너에서 Spring·DB 없이 실제 cgroup 파일과 JFR 파서를 먼저 검사한다. */
    public static void main(String[] args) throws Exception {
        assertThat(IsolatedReadProbe.cpuStats()).containsKeys("usage_usec", "throttled_usec", "nr_periods");
        if (args.length == 2) {
            IsolatedReadProbe.summarizeRecording(new ObjectMapper(), Path.of(args[0]), Path.of(args[1]));
            System.out.println("PASS: actual recorded JVM threads parsed without private event values");
            return;
        }
        var file = Path.of("/tmp/probe-check.jfr");
        var output = Path.of("/tmp/probe-check.json");
        try (var recording = new Recording()) {
            recording.setSettings(java.util.Map.of());
            recording.enable("jdk.CPULoad").withPeriod(java.time.Duration.ofMillis(50));
            recording.start(); Thread.sleep(200); recording.stop(); recording.dump(file);
        }
        IsolatedReadProbe.summarizeRecording(new ObjectMapper(), file, output);
        assertThat(Files.size(output)).isPositive();
        System.out.println("PASS: runtime cgroup counters and JFR parsing without Spring or DB");
    }
    @Test void acceptsOnlyBoundedPhaseNames() {
        for (String value : new String[]{"read-100", "json-a1", "summary-b1", "generator-c4"})
            assertThat(IsolatedReadProbe.safePhase(value)).isTrue();
        for (String value : new String[]{"../secret", "/tmp/file", "a/b", "A", "a\n", "a".repeat(41), ""})
            assertThat(IsolatedReadProbe.safePhase(value)).isFalse();
        assertThat(IsolatedReadProbe.safePhase(null)).isFalse();
    }
}
