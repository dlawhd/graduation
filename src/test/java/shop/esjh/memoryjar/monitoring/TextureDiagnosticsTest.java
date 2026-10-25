package shop.esjh.memoryjar.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.entity.ai.JarDesign;
import shop.esjh.memoryjar.repository.ai.JarDesignRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.service.jar.JarDesignTextureService;
import shop.esjh.memoryjar.service.jar.JarDesignTextureCache;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static shop.esjh.memoryjar.monitoring.LoginDiagnostics.Stage.*;

/** 실제 DB/AWS 없이 로컬 전용 활성화, 요청 분리, 기존 보안·예외·스트림 정리를 검증한다. */
class TextureDiagnosticsTest {
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10};

    @Test void springBeanDefaultsToOffAndRequiresLocalWithoutProdEvenWhenFlagIsOn() {
        new ApplicationContextRunner().withUserConfiguration(LoginDiagnostics.class)
                .withPropertyValues("spring.profiles.active=local")
                .run(context -> assertThat(context.getBean(LoginDiagnostics.class).snapshot().textures().enabled()).isFalse());
        for (var profiles : List.of(List.<String>of(), List.of("prod"), List.of("test"), List.of("local", "prod"))) {
            var environment = new MockEnvironment();
            environment.setActiveProfiles(profiles.toArray(String[]::new));
            var diagnostics = new LoginDiagnostics(false, false, true, environment);
            assertThat(diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE)).isNull();
            assertThat(diagnostics.snapshot().textures().enabled()).isFalse();
        }
        var local = new MockEnvironment(); local.setActiveProfiles("local");
        assertThat(new LoginDiagnostics(false, false, true, local).snapshot().textures().enabled()).isTrue();
        assertThat(new LoginDiagnostics(false, false, false, local).snapshot().textures().enabled()).isFalse();
    }

    @Test void disabledTextureFlagDoesNotBorrowReadFlagOrSampleGc() throws Exception {
        var diagnostics = new LoginDiagnostics(true, true, () -> { throw new AssertionError("must not sample"); });
        new LoginDiagnosticsFilter(diagnostics).doFilter(request("IMAGE"), new MockHttpServletResponse(), (r, s) -> {
            assertThat(LoginDiagnostics.measure(TEXTURE_DB, () -> 42)).isEqualTo(42);
            assertThat(LoginDiagnostics.measureIo(TEXTURE_S3_READ, () -> PNG)).isSameAs(PNG);
        });
        assertThat(diagnostics.snapshot().textures().recent()).isEmpty();
        assertThat(diagnostics.snapshot().reads().recent()).isEmpty();
    }

    @Test void exactTextureRoutesAreClassifiedWithoutKeepingIdsQueriesCookiesOrBodies() throws Exception {
        var diagnostics = enabled(); var filter = new LoginDiagnosticsFilter(diagnostics);
        for (String part : List.of("IMAGE", "BODY", "")) {
            var request = request(part);
            request.setRequestURI("/context/api/v1/jars/42/design/texture"); request.setContextPath("/context");
            request.setQueryString("part=" + part + "&private=secret-query");
            request.addHeader("Cookie", "accessToken=secret-cookie"); request.setContent("private-photo".getBytes());
            filter.doFilter(request, new MockHttpServletResponse(), (r, s) -> {});
        }
        filter.doFilter(request(null), new MockHttpServletResponse(), (r, s) -> {});
        assertThat(diagnostics.snapshot().textures().recent()).extracting(LoginDiagnostics.Sample::requestKind)
                .containsExactly(LoginDiagnostics.RequestKind.TEXTURE_IMAGE, LoginDiagnostics.RequestKind.TEXTURE_BODY,
                        LoginDiagnostics.RequestKind.TEXTURE_IMAGE, LoginDiagnostics.RequestKind.TEXTURE_IMAGE);
        for (String route : List.of("/api/v1/jars/0/design/texture", "/api/v1/jars/42/design/texture/extra",
                "/api/v1/jars/not-a-number/design/texture", "/api/v1/jars/42", "/api/v1/jars/42/design/texture/")) {
            filter.doFilter(new MockHttpServletRequest("GET", route), new MockHttpServletResponse(), (r, s) -> {});
        }
        filter.doFilter(request("OTHER"), new MockHttpServletResponse(), (r, s) -> {});
        var post = request("IMAGE"); post.setMethod("POST");
        filter.doFilter(post, new MockHttpServletResponse(), (r, s) -> {});
        assertThat(diagnostics.snapshot().textures().completedCount()).isEqualTo(4);
        assertThat(new ObjectMapper().writeValueAsString(diagnostics.snapshot())).doesNotContain(
                "secret-query", "secret-cookie", "private-photo", "/api/v1/", "\"jarId\"", "\"userId\"");
    }

    @Test void realServiceStagesKeepPngAndEndDbTransactionBeforeS3() throws Exception {
        var fixture = new Fixture(); var diagnostics = enabled();
        when(fixture.s3.getObject(any(GetObjectRequest.class))).thenAnswer(call -> {
            verify(fixture.tx).commit(any());
            assertThat(((GetObjectRequest) call.getArgument(0)).key()).isEqualTo("private-image.png");
            return stream(new ByteArrayInputStream(PNG));
        });
        new LoginDiagnosticsFilter(diagnostics).doFilter(request("IMAGE"), new MockHttpServletResponse(),
                (r, s) -> s.getOutputStream().write(fixture.service.read(1L, 42L, JarDesignTextureService.Part.IMAGE)));
        var sample = diagnostics.snapshot().textures().recent().get(0);
        assertThat(sample.completed()).isTrue(); assertThat(sample.responseStatus()).isEqualTo(200);
        assertThat(sample.stages()).containsKeys(TEXTURE_DB, TEXTURE_MEMBER_LOOKUP, TEXTURE_DESIGN_LOOKUP,
                TEXTURE_S3_OPEN, TEXTURE_S3_READ);
        assertThat(sample.stages().values()).allSatisfy(timing -> assertThat(timing.completed()).isTrue());
        assertThat(sample.stages().get(TEXTURE_DB).elapsedNanos()).isGreaterThanOrEqualTo(
                sample.stages().get(TEXTURE_MEMBER_LOOKUP).elapsedNanos() + sample.stages().get(TEXTURE_DESIGN_LOOKUP).elapsedNanos());
        assertThat(sample.elapsedNanos()).isGreaterThanOrEqualTo(sample.stages().get(TEXTURE_DB).elapsedNanos()
                + sample.stages().get(TEXTURE_S3_OPEN).elapsedNanos() + sample.stages().get(TEXTURE_S3_READ).elapsedNanos());
        assertThat(new ObjectMapper().writeValueAsString(sample)).doesNotContain("private-image.png", "private-bucket");
        verify(fixture.members, times(1)).existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(42L, 1L);
        verify(fixture.designs, times(1)).findByJar_JarId(42L);
    }

    @Test void forbiddenStillStopsBeforeDesignAndStorageAndCannotLeakToNextRequest() {
        var fixture = new Fixture(); var diagnostics = enabled();
        when(fixture.members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(42L, 1L)).thenReturn(false);
        assertThatThrownBy(() -> new LoginDiagnosticsFilter(diagnostics).doFilter(request("IMAGE"),
                new MockHttpServletResponse(), (r, s) -> fixture.service.read(1L, 42L, JarDesignTextureService.Part.IMAGE)))
                .isInstanceOf(ResponseStatusException.class).extracting("statusCode").isEqualTo(org.springframework.http.HttpStatus.FORBIDDEN);
        verifyNoInteractions(fixture.s3); verify(fixture.designs, never()).findByJar_JarId(any());
        var sample = diagnostics.snapshot().textures().recent().get(0);
        assertThat(sample.stages()).doesNotContainKeys(TEXTURE_S3_OPEN, TEXTURE_S3_READ);
        assertThat(sample.stages().get(TEXTURE_DB).completed()).isFalse();
        assertThat(LoginDiagnostics.beginDatabaseOperation()).isNull();
        assertThat(LoginDiagnostics.measure(TEXTURE_S3_OPEN, () -> "outside")).isEqualTo("outside");
        assertThat(sample.stages()).doesNotContainKey(TEXTURE_S3_OPEN);
    }

    @Test void storageOpenFailureIsMarkedButPrivateSdkMessageIsNotRetained() {
        var fixture = new Fixture(); var diagnostics = enabled();
        when(fixture.s3.getObject(any(GetObjectRequest.class))).thenThrow(S3Exception.builder()
                .statusCode(403).message("private-image.png secret-signature").build());
        assertThatThrownBy(() -> new LoginDiagnosticsFilter(diagnostics).doFilter(request("IMAGE"),
                new MockHttpServletResponse(), (r, s) -> fixture.service.read(1L, 42L, JarDesignTextureService.Part.IMAGE)))
                .isInstanceOf(ResponseStatusException.class).hasMessageNotContaining("secret-signature").hasMessageNotContaining("private-image.png");
        var sample = diagnostics.snapshot().textures().recent().get(0);
        assertThat(sample.stages().get(TEXTURE_S3_OPEN).completed()).isFalse();
        assertThat(sample.stages()).doesNotContainKey(TEXTURE_S3_READ);
    }

    @Test void failedStreamReadStillClosesAndKeepsOriginalErrorPolicy() {
        var fixture = new Fixture(); var diagnostics = enabled(); var closed = new AtomicBoolean();
        when(fixture.s3.getObject(any(GetObjectRequest.class))).thenReturn(stream(new InputStream() {
            @Override public int read() throws IOException { throw new IOException("private-stream-failure"); }
            @Override public void close() { closed.set(true); }
        }));
        assertThatThrownBy(() -> new LoginDiagnosticsFilter(diagnostics).doFilter(request("IMAGE"),
                new MockHttpServletResponse(), (r, s) -> fixture.service.read(1L, 42L, JarDesignTextureService.Part.IMAGE)))
                .isInstanceOf(ResponseStatusException.class).hasMessageNotContaining("private-stream-failure");
        assertThat(closed).isTrue();
        assertThat(diagnostics.snapshot().textures().recent().get(0).stages().get(TEXTURE_S3_READ).completed()).isFalse();
    }

    @Test void ioMeasurementPreservesSameExceptionAndRemovesRequestContext() {
        var diagnostics = enabled(); var attempt = diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_BODY);
        var original = new IOException("not-stored");
        try { assertThatThrownBy(() -> LoginDiagnostics.measureIo(TEXTURE_S3_READ, () -> { throw original; })).isSameAs(original); }
        finally { diagnostics.finish(attempt, null, false); }
        assertThat(LoginDiagnostics.beginDatabaseOperation()).isNull();
        assertThat(diagnostics.snapshot().textures().recent().get(0).completed()).isFalse();
    }

    @Test void boundedTextureBufferIsIndependentAndCannotBeMutated() {
        var diagnostics = new LoginDiagnostics(true, true, true, () -> null);
        diagnostics.finish(diagnostics.start(), 200, true);
        diagnostics.finish(diagnostics.start(LoginDiagnostics.RequestKind.ME), 200, true);
        for (int i = 0; i < 70; i++) diagnostics.finish(diagnostics.start(LoginDiagnostics.RequestKind.TEXTURE_IMAGE), 200, true);
        var snapshot = diagnostics.snapshot();
        assertThat(snapshot.recent()).hasSize(1); assertThat(snapshot.reads().recent()).hasSize(1);
        assertThat(snapshot.textures().recent()).hasSize(64);
        assertThat(snapshot.textures().completedCount()).isEqualTo(70); assertThat(snapshot.textures().evictedCount()).isEqualTo(6);
        assertThatThrownBy(() -> snapshot.textures().recent().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test void parallelTextureKindsNeverShareStageContext() throws Exception {
        var diagnostics = enabled(); var workers = Executors.newFixedThreadPool(2);
        try {
            var tasks = workers.invokeAll(List.of(() -> record(diagnostics, LoginDiagnostics.RequestKind.TEXTURE_IMAGE, TEXTURE_S3_OPEN),
                    () -> record(diagnostics, LoginDiagnostics.RequestKind.TEXTURE_BODY, TEXTURE_S3_READ)));
            for (var task : tasks) task.get();
            assertThat(diagnostics.snapshot().textures().recent()).hasSize(2)
                    .allSatisfy(sample -> assertThat(sample.stages()).hasSize(1));
        } finally { workers.shutdownNow(); }
    }

    private Void record(LoginDiagnostics diagnostics, LoginDiagnostics.RequestKind kind, LoginDiagnostics.Stage stage) {
        var attempt = diagnostics.start(kind);
        try { LoginDiagnostics.measure(stage, () -> true); } finally { diagnostics.finish(attempt, 200, true); }
        return null;
    }

    private LoginDiagnostics enabled() { return new LoginDiagnostics(false, false, true, () -> null); }
    private MockHttpServletRequest request(String part) {
        var request = new MockHttpServletRequest("GET", "/api/v1/jars/42/design/texture");
        if (part != null) request.addParameter("part", part);
        return request;
    }
    private static ResponseInputStream<GetObjectResponse> stream(InputStream input) {
        return new ResponseInputStream<>(GetObjectResponse.builder().contentLength((long) PNG.length).build(), input);
    }

    /** 실제 저장소 대신 작은 PNG만 반환해 외부 통신 없이 서비스 경계를 검사한다. */
    private static final class Fixture {
        final JarMemberRepository members = mock(JarMemberRepository.class);
        final JarDesignRepository designs = mock(JarDesignRepository.class);
        final S3Client s3 = mock(S3Client.class);
        final PlatformTransactionManager tx = mock(PlatformTransactionManager.class);
        final JarDesignTextureService service;
        Fixture() {
            var properties = new S3Properties(); properties.setBucket("private-bucket");
            when(tx.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
            when(members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(42L, 1L)).thenReturn(true);
            var design = JarDesign.builder().build(); ReflectionTestUtils.setField(design, "finalS3Key", "private-image.png");
            when(designs.findByJar_JarId(42L)).thenReturn(Optional.of(design));
            service = new JarDesignTextureService(members, designs, s3, properties, tx, new JarDesignTextureCache(false));
        }
    }
}
