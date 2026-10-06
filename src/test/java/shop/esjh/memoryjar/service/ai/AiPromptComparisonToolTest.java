package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import shop.esjh.memoryjar.config.properties.AiGenerationImageProperties;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 서버 수동 비교 도구도 일반 테스트에서는 네트워크/DB/S3에 접근하지 않는지 검사한다. */
class AiPromptComparisonToolTest {
    @Test
    void trialsContainOnlyTwoStylesAndKeepProductionBaseline() throws Exception {
        var trials = AiPromptComparisonTool.trials(new AiPromptCatalog());
        assertThat(trials).extracting(AiPromptComparisonTool.Trial::id)
                .containsExactly("CUTE_2D_OLD", "CUTE_2D_NEW", "HAND_DRAWN_OLD", "HAND_DRAWN_NEW");
        assertThat(trials.get(0).prompt()).isEqualTo(new AiPromptCatalog()
                .resolve(shop.esjh.memoryjar.enums.ai.JarAiStyle.CUTE_2D).prompt());
        assertThat(trials.get(2).prompt()).isEqualTo(new AiPromptCatalog()
                .resolve(shop.esjh.memoryjar.enums.ai.JarAiStyle.HAND_DRAWN).prompt());
        assertThat(trials.get(1).prompt().length()).isLessThan(trials.get(0).prompt().length());
        assertThat(trials.get(3).prompt().length()).isLessThan(trials.get(2).prompt().length());
    }

    @Test
    void configurationAcceptsOnlyExistingSupportedModelAndSquareDimensions() {
        var env = configuredEnvironment();
        var config = AiPromptComparisonTool.providerConfiguration(env);
        assertThat(config.getModel()).isEqualTo(AiPromptComparisonTool.MODEL);
        assertThat(config.getApiToken()).isEqualTo("test-only-never-a-real-token");
        env.put("APP_AI_CLOUDFLARE_MODEL", "@cf/other/model");
        assertThatThrownBy(() -> AiPromptComparisonTool.providerConfiguration(env)).isInstanceOf(IllegalArgumentException.class);
        env.put("APP_AI_CLOUDFLARE_MODEL", AiPromptComparisonTool.MODEL);
        env.put("APP_AI_GENERATION_REQUIRED_IMAGE_WIDTH", "480");
        assertThatThrownBy(() -> AiPromptComparisonTool.providerConfiguration(env)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"APP_AI_CLOUDFLARE_ACCOUNT_ID", "APP_AI_CLOUDFLARE_API_TOKEN"})
    void missingAuthenticationFailsBeforeAnyExternalRequest(String key) {
        var env = configuredEnvironment();
        env.remove(key);
        assertThatThrownBy(() -> AiPromptComparisonTool.providerConfiguration(env))
                .isInstanceOf(IllegalArgumentException.class).hasMessage(null);
    }

    /** 원문을 private sink로 보내도 기존 Client의 안전 예외/분류는 바뀌지 않는다. */
    @Test
    void rawErrorIsCapturedSeparatelyAndNeverAddedToSafeException() throws Exception {
        String privateText = "private-source-and-private-token-do-not-log";
        byte[] raw = ("{\"success\":false,\"errors\":[{\"code\":3030,\"message\":\"AiError: "
                + privateText + "\"}]}").getBytes(StandardCharsets.UTF_8);
        AtomicReference<byte[]> captured = new AtomicReference<>();
        var observer = observedClient(400, raw, captured);
        var client = new CloudflareWorkersAiClient(observer, AiPromptComparisonTool.JSON,
                AiPromptComparisonTool.providerConfiguration(configuredEnvironment()), new AiGenerationImageProperties());
        assertThatThrownBy(() -> client.generateImage(new CloudflareWorkersAiClient.CloudflareImageGenerationRequest(
                "test prompt", List.of(new CloudflareWorkersAiClient.CloudflareImageInput("draft-original.png", new byte[]{1})),
                AiPromptComparisonTool.SEED)))
                .isInstanceOfSatisfying(CloudflareWorkersAiClient.CloudflareAiClientException.class, failure -> {
                    assertThat(failure.getFailureType()).isEqualTo(CloudflareWorkersAiClient.FailureType.REQUEST_FAILED);
                    assertThat(failure.getCloudflareErrorCodes()).containsExactly("3030");
                    assertThat(failure.getSafeDiagnostics()).contains("AI_ERROR_UNRECOGNIZED").doesNotContain(privateText);
                    assertThat(failure.getMessage()).doesNotContain(privateText);
                    assertThat(failure.getCause()).isNull();
                });
        assertThat(captured.get()).containsExactly(raw);
        assertThat(observer.ray).isEqualTo("abc123-ICN");
    }

    @Test
    void errorCaptureIsBoundedAndMalformedBodyIsNotPrinted() throws Exception {
        byte[] enormous = new byte[AiPromptComparisonTool.MAX_ERROR_BYTES * 2];
        AtomicReference<byte[]> captured = new AtomicReference<>();
        var observer = observedClient(400, enormous, captured);
        try (var body = observer.send(HttpRequest.newBuilder(URI.create("https://example.invalid/")).build(),
                HttpResponse.BodyHandlers.ofInputStream()).body()) {
            assertThat(body.readAllBytes()).hasSize(AiPromptComparisonTool.MAX_ERROR_BYTES + 1);
        }
        assertThat(captured.get()).hasSize(AiPromptComparisonTool.MAX_ERROR_BYTES + 1);
    }

    @Test
    void successBodyIsNotCopiedIntoPrivateErrorFile() throws Exception {
        AtomicReference<byte[]> captured = new AtomicReference<>();
        var observer = observedClient(200, new byte[]{1, 2}, captured);
        try (var body = observer.send(HttpRequest.newBuilder(URI.create("https://example.invalid/")).build(),
                HttpResponse.BodyHandlers.ofInputStream()).body()) {
            assertThat(body.readAllBytes()).containsExactly(1, 2);
        }
        assertThat(captured.get()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"CONTENT_POLICY_REJECTED", "INPUT_INVALID", "QUOTA_EXCEEDED", "RATE_LIMITED", "CAPACITY_EXCEEDED"})
    void explicitRejectionOrLimitsStopRemainingComparisons(String result) {
        assertThat(AiPromptComparisonTool.mustStop(result)).isTrue();
        assertThat(AiPromptComparisonTool.mustStop("REQUEST_FAILED")).isFalse();
        assertThat(AiPromptComparisonTool.mustStop("PROVIDER_OK_IMAGE_VALID")).isFalse();
    }

    private Map<String, String> configuredEnvironment() {
        var env = new HashMap<String, String>();
        env.put("APP_AI_CLOUDFLARE_ACCOUNT_ID", "test-account");
        env.put("APP_AI_CLOUDFLARE_API_TOKEN", "test-only-never-a-real-token");
        return env;
    }

    private AiPromptComparisonTool.ErrorCaptureClient observedClient(int status, byte[] bytes,
            AtomicReference<byte[]> captured) throws Exception {
        var delegate = mock(HttpClient.class);
        @SuppressWarnings("unchecked") HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.headers()).thenReturn(HttpHeaders.of(Map.of("cf-ray", List.of("abc123-ICN")), (a, b) -> true));
        when(response.body()).thenReturn(new ByteArrayInputStream(bytes));
        when(delegate.send(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<InputStream>>any()))
                .thenReturn(response);
        return new AiPromptComparisonTool.ErrorCaptureClient(delegate, captured::set);
    }
}
