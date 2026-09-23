package shop.esjh.memoryjar.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.config.properties.AiGenerationImageProperties;
import shop.esjh.memoryjar.config.properties.CloudflareAiProperties;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Cloudflare REST Client가 1024×1024 요청 계약과 외부 오류 분류를 지키는지 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class CloudflareWorkersAiClientTest {

    @Mock private HttpClient httpClient;
    @Mock private HttpResponse<InputStream> response;

    private CloudflareWorkersAiClient client;
    private AiGenerationImageProperties generationImageProperties;

    @BeforeEach
    void setUp() {
        CloudflareAiProperties cloudflareProperties = new CloudflareAiProperties();
        cloudflareProperties.setAccountId("account_123");
        cloudflareProperties.setApiToken("test-token");
        cloudflareProperties.setModel("@cf/black-forest-labs/flux-2-klein-4b");
        cloudflareProperties.setTimeoutSeconds(60);

        generationImageProperties = new AiGenerationImageProperties();
        generationImageProperties.setMaxGeneratedImageSize(10L * 1024 * 1024);
        generationImageProperties.setRequiredGeneratedImageWidth(1024);
        generationImageProperties.setRequiredGeneratedImageHeight(1024);

        client = new CloudflareWorkersAiClient(httpClient, new ObjectMapper(), cloudflareProperties, generationImageProperties);
    }

    @Test
    void generateImage_sendsServerControlled1024SquareRequestAndDecodesImage() throws Exception {
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(new ByteArrayInputStream("""
                {"success":true,"result":{"image":"data:image/png;base64,AQID"}}
                """.getBytes(StandardCharsets.UTF_8)));
        when(httpClient.send(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<InputStream>>any()))
                .thenReturn(response);

        byte[] image = client.generateImage(request(123L));

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), ArgumentMatchers.<HttpResponse.BodyHandler<InputStream>>any());
        HttpRequest httpRequest = requestCaptor.getValue();
        String body = readBody(httpRequest);

        assertThat(image).containsExactly(1, 2, 3);
        assertThat(httpRequest.uri().toString()).isEqualTo(
                "https://api.cloudflare.com/client/v4/accounts/account_123/ai/run/@cf/black-forest-labs/flux-2-klein-4b");
        assertThat(httpRequest.headers().firstValue("Authorization")).contains("Bearer test-token");
        assertThat(body).contains("name=\"prompt\"", "draw a cat");
        assertThat(body).contains("name=\"width\"", "1024", "name=\"height\"");
        assertThat(body).contains("name=\"seed\"", "123", "name=\"input_image_0\"");
        assertThat(body).contains("filename=\"original.png\"");
        assertThat(body).doesNotContain("filename*=");
    }

    @Test
    void generateImage_mapsRateLimitToDedicatedFailureType() throws Exception {
        when(response.statusCode()).thenReturn(429);
        when(response.body()).thenReturn(new ByteArrayInputStream(new byte[0]));
        when(httpClient.send(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<InputStream>>any()))
                .thenReturn(response);

        assertThatThrownBy(() -> client.generateImage(request(null)))
                .isInstanceOf(CloudflareWorkersAiClient.CloudflareAiClientException.class)
                .extracting(error -> ((CloudflareWorkersAiClient.CloudflareAiClientException) error).getFailureType())
                .isEqualTo(CloudflareWorkersAiClient.FailureType.RATE_LIMITED);
    }

    @Test
    void generateImage_retainsOnlySafeHttpStatusAndCloudflareErrorCodesForRejectedRequest() throws Exception {
        when(response.statusCode()).thenReturn(403);
        when(response.headers()).thenReturn(HttpHeaders.of(Map.of("cf-ray", List.of("9f13c10a0b0c1234-ICN")),
                (name, value) -> true));
        when(response.body()).thenReturn(new ByteArrayInputStream("""
                {"success":false,"errors":[{"code":10000,"message":"sensitive provider detail"}]}
                """.getBytes(StandardCharsets.UTF_8)));
        when(httpClient.send(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<InputStream>>any()))
                .thenReturn(response);

        assertThatThrownBy(() -> client.generateImage(request(null)))
                .isInstanceOf(CloudflareWorkersAiClient.CloudflareAiClientException.class)
                .satisfies(error -> {
                    var cloudflareError = (CloudflareWorkersAiClient.CloudflareAiClientException) error;
                    assertThat(cloudflareError.getFailureType())
                            .isEqualTo(CloudflareWorkersAiClient.FailureType.REQUEST_FAILED);
                    assertThat(cloudflareError.getHttpStatus()).isEqualTo(403);
                    assertThat(cloudflareError.getCfRay()).isEqualTo("9f13c10a0b0c1234-ICN");
                    assertThat(cloudflareError.getCloudflareErrorCodes()).containsExactly("10000");
                });
    }

    @Test
    void generateImage_retainsErrorCodesWhenCloudflareReturnsSuccessFalseWithHttp200() throws Exception {
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(new ByteArrayInputStream("""
                {"success":false,"errors":[{"code":3041,"message":"sensitive provider detail"}]}
                """.getBytes(StandardCharsets.UTF_8)));
        when(httpClient.send(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<InputStream>>any()))
                .thenReturn(response);

        assertThatThrownBy(() -> client.generateImage(request(null)))
                .isInstanceOf(CloudflareWorkersAiClient.CloudflareAiClientException.class)
                .satisfies(error -> {
                    var cloudflareError = (CloudflareWorkersAiClient.CloudflareAiClientException) error;
                    assertThat(cloudflareError.getHttpStatus()).isEqualTo(200);
                    assertThat(cloudflareError.getCloudflareErrorCodes()).containsExactly("3041");
                });
    }

    @Test
    void generateImage_mapsTimeoutToDedicatedFailureType() throws Exception {
        when(httpClient.send(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<InputStream>>any()))
                .thenThrow(new HttpTimeoutException("timeout"));

        assertThatThrownBy(() -> client.generateImage(request(null)))
                .isInstanceOf(CloudflareWorkersAiClient.CloudflareAiClientException.class)
                .extracting(error -> ((CloudflareWorkersAiClient.CloudflareAiClientException) error).getFailureType())
                .isEqualTo(CloudflareWorkersAiClient.FailureType.TIMEOUT);
    }

    @Test
    void generateImage_mapsMalformedBase64ToInvalidResponse() throws Exception {
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(new ByteArrayInputStream(
                "{\"success\":true,\"result\":{\"image\":\"not-base64\"}}".getBytes(StandardCharsets.UTF_8)));
        when(httpClient.send(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<InputStream>>any()))
                .thenReturn(response);

        assertThatThrownBy(() -> client.generateImage(request(null)))
                .isInstanceOf(CloudflareWorkersAiClient.CloudflareAiClientException.class)
                .extracting(error -> ((CloudflareWorkersAiClient.CloudflareAiClientException) error).getFailureType())
                .isEqualTo(CloudflareWorkersAiClient.FailureType.INVALID_RESPONSE);
    }

    @Test
    void generateImage_rejectsOversizedResponseBodyBeforeBase64Decoding() throws Exception {
        generationImageProperties.setMaxGeneratedImageSize(3);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(new ByteArrayInputStream(new byte[70 * 1024]));
        when(httpClient.send(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<InputStream>>any()))
                .thenReturn(response);

        assertThatThrownBy(() -> client.generateImage(request(null)))
                .isInstanceOf(CloudflareWorkersAiClient.CloudflareAiClientException.class)
                .extracting(error -> ((CloudflareWorkersAiClient.CloudflareAiClientException) error).getFailureType())
                .isEqualTo(CloudflareWorkersAiClient.FailureType.INVALID_RESPONSE);
    }

    @Test
    void generateImage_rejectsMissingProviderConfigurationWithFeatureCode() {
        CloudflareAiProperties invalidProperties = new CloudflareAiProperties();
        invalidProperties.setAccountId("account_123");
        invalidProperties.setModel("@cf/black-forest-labs/flux-2-klein-4b");
        invalidProperties.setTimeoutSeconds(60);
        CloudflareWorkersAiClient invalidClient = new CloudflareWorkersAiClient(
                httpClient, new ObjectMapper(), invalidProperties, generationImageProperties);

        assertThatThrownBy(() -> invalidClient.generateImage(request(null)))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.AI_PROVIDER_CONFIGURATION_UNAVAILABLE);
    }

    private CloudflareWorkersAiClient.CloudflareImageGenerationRequest request(Long seed) {
        return new CloudflareWorkersAiClient.CloudflareImageGenerationRequest(
                "draw a cat",
                List.of(new CloudflareWorkersAiClient.CloudflareImageInput("original.png", new byte[]{1, 2, 3})),
                seed
        );
    }

    private String readBody(HttpRequest request) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        CompletableFuture<Void> completed = new CompletableFuture<>();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<>() {
            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer item) {
                ByteBuffer copy = item.duplicate();
                byte[] bytes = new byte[copy.remaining()];
                copy.get(bytes);
                output.writeBytes(bytes);
            }

            @Override
            public void onError(Throwable throwable) {
                completed.completeExceptionally(throwable);
            }

            @Override
            public void onComplete() {
                completed.complete(null);
            }
        });
        completed.get(5, TimeUnit.SECONDS);
        return output.toString(StandardCharsets.UTF_8);
    }
}
