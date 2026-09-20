package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** AI 생성의 외부 I/O와 짧은 DB 상태 전이가 분리되는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class JarAiGenerationServiceTest {

    @Mock private JarAiGenerationPersistenceService persistenceService;
    @Mock private AiPromptCatalog promptCatalog;
    @Mock private CloudflareWorkersAiClient cloudflareClient;
    @Mock private GeneratedAiImageValidator generatedImageValidator;
    @Mock private PixelPostProcessor pixelPostProcessor;
    @Mock private DraftOriginalImageModerationService moderationService;
    @Mock private AiDraftS3KeyFactory s3KeyFactory;
    @Mock private S3Client s3Client;
    @Mock private ResponseInputStream<GetObjectResponse> originalInput;

    @Test
    @DisplayName("일반 스타일은 검증된 후보를 S3에 저장한 뒤에만 성공 처리한다")
    void generate_savesNormalCandidateThenMarksSucceeded() throws Exception {
        JarAiGenerationService service = service();
        arrangeStart(JarAiStyle.CUTE_2D);
        arrangeCandidateKey();
        arrangeOriginalRead("original".getBytes(StandardCharsets.UTF_8));
        when(cloudflareClient.generateImage(any())).thenReturn("provider".getBytes(StandardCharsets.UTF_8));
        when(generatedImageValidator.validateAndNormalize("provider".getBytes(StandardCharsets.UTF_8)))
                .thenReturn("normalized".getBytes(StandardCharsets.UTF_8));
        when(persistenceService.completeSucceeded(eq(10L), eq(100L), anyString())).thenReturn(true);

        Long generationId = service.generate(1L, 10L, JarAiStyle.CUTE_2D, 7L);

        ArgumentCaptor<CloudflareWorkersAiClient.CloudflareImageGenerationRequest> request =
                ArgumentCaptor.forClass(CloudflareWorkersAiClient.CloudflareImageGenerationRequest.class);
        ArgumentCaptor<PutObjectRequest> putRequest = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(cloudflareClient).generateImage(request.capture());
        verify(s3Client).putObject(putRequest.capture(), any(RequestBody.class));
        verify(moderationService).verifyAllowed("normalized".getBytes(StandardCharsets.UTF_8));
        verify(persistenceService).completeSucceeded(eq(10L), eq(100L), eq(putRequest.getValue().key()));
        verify(persistenceService, never()).completeFailed(anyLong(), anyLong(), any(), anyString());
        assertThat(generationId).isEqualTo(100L);
        assertThat(request.getValue().images()).hasSize(1);
        assertThat(request.getValue().prompt()).isEqualTo("test prompt");
        assertThat(putRequest.getValue().contentType()).isEqualTo("image/png");
        assertThat(putRequest.getValue().ifNoneMatch()).isEqualTo("*");
    }

    @Test
    @DisplayName("PIXEL은 Cloudflare 두 입력 뒤 Java 후처리 결과만 후보로 저장한다")
    void generate_pixelUsesReferenceAndPostProcessor() throws Exception {
        JarAiGenerationService service = service();
        arrangeStart(JarAiStyle.PIXEL);
        arrangeCandidateKey();
        arrangeOriginalRead("original".getBytes(StandardCharsets.UTF_8));
        when(promptCatalog.loadReferenceImage(any())).thenReturn("reference".getBytes(StandardCharsets.UTF_8));
        when(cloudflareClient.generateImage(any())).thenReturn("provider".getBytes(StandardCharsets.UTF_8));
        when(generatedImageValidator.validateAndNormalize(any())).thenReturn("normalized".getBytes(StandardCharsets.UTF_8));
        when(pixelPostProcessor.postProcess("normalized".getBytes(StandardCharsets.UTF_8)))
                .thenReturn("pixel".getBytes(StandardCharsets.UTF_8));
        when(persistenceService.completeSucceeded(eq(10L), eq(100L), anyString())).thenReturn(true);

        service.generate(1L, 10L, JarAiStyle.PIXEL, null);

        ArgumentCaptor<CloudflareWorkersAiClient.CloudflareImageGenerationRequest> request =
                ArgumentCaptor.forClass(CloudflareWorkersAiClient.CloudflareImageGenerationRequest.class);
        verify(cloudflareClient).generateImage(request.capture());
        verify(pixelPostProcessor).postProcess("normalized".getBytes(StandardCharsets.UTF_8));
        verify(moderationService).verifyAllowed("pixel".getBytes(StandardCharsets.UTF_8));
        assertThat(request.getValue().images()).hasSize(2);
        assertThat(request.getValue().images().get(1).bytes()).isEqualTo("reference".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("Cloudflare timeout은 후보 저장 없이 PROVIDER_TIMEOUT으로 종료한다")
    void generate_recordsProviderTimeout() throws Exception {
        JarAiGenerationService service = service();
        arrangeStart(JarAiStyle.CUTE_2D);
        arrangeOriginalRead("original".getBytes(StandardCharsets.UTF_8));
        when(cloudflareClient.generateImage(any())).thenThrow(new CloudflareWorkersAiClient.CloudflareAiClientException(
                CloudflareWorkersAiClient.FailureType.TIMEOUT, "timeout"));

        service.generate(1L, 10L, JarAiStyle.CUTE_2D, null);

        verify(persistenceService).completeFailed(10L, 100L,
                JarAiGenerationErrorCode.PROVIDER_TIMEOUT, "AI 제공자 요청 또는 응답 검증에 실패했습니다.");
        verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    @DisplayName("Cloudflare 429는 후보 저장 없이 PROVIDER_RATE_LIMITED로 종료한다")
    void generate_recordsProviderRateLimit() throws Exception {
        JarAiGenerationService service = service();
        arrangeStart(JarAiStyle.CUTE_2D);
        arrangeOriginalRead("original".getBytes(StandardCharsets.UTF_8));
        when(cloudflareClient.generateImage(any())).thenThrow(new CloudflareWorkersAiClient.CloudflareAiClientException(
                CloudflareWorkersAiClient.FailureType.RATE_LIMITED, "rate limited"));

        service.generate(1L, 10L, JarAiStyle.CUTE_2D, null);

        verify(persistenceService).completeFailed(10L, 100L,
                JarAiGenerationErrorCode.PROVIDER_RATE_LIMITED, "AI 제공자 요청 또는 응답 검증에 실패했습니다.");
        verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    @DisplayName("규격이 잘못된 AI 이미지는 후보 저장 없이 PROVIDER_INVALID_RESPONSE로 종료한다")
    void generate_recordsInvalidGeneratedImage() throws Exception {
        JarAiGenerationService service = service();
        arrangeStart(JarAiStyle.CUTE_2D);
        arrangeOriginalRead("original".getBytes(StandardCharsets.UTF_8));
        when(cloudflareClient.generateImage(any())).thenReturn("invalid".getBytes(StandardCharsets.UTF_8));
        when(generatedImageValidator.validateAndNormalize(any())).thenThrow(
                new GeneratedAiImageValidator.InvalidGeneratedAiImageException("invalid image"));

        service.generate(1L, 10L, JarAiStyle.CUTE_2D, null);

        verify(persistenceService).completeFailed(10L, 100L,
                JarAiGenerationErrorCode.PROVIDER_INVALID_RESPONSE, "AI 결과 이미지가 후보 규격을 충족하지 않습니다.");
        verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    @DisplayName("후보 업로드 뒤 stale 처리된 Generation은 S3 객체를 즉시 보상 삭제한다")
    void generate_deletesCandidateWhenLateSuccessIsRejected() throws Exception {
        JarAiGenerationService service = service();
        arrangeStart(JarAiStyle.CUTE_2D);
        arrangeCandidateKey();
        arrangeOriginalRead("original".getBytes(StandardCharsets.UTF_8));
        when(cloudflareClient.generateImage(any())).thenReturn("provider".getBytes(StandardCharsets.UTF_8));
        when(generatedImageValidator.validateAndNormalize(any())).thenReturn("normalized".getBytes(StandardCharsets.UTF_8));
        when(persistenceService.completeSucceeded(eq(10L), eq(100L), anyString())).thenReturn(false);

        service.generate(1L, 10L, JarAiStyle.CUTE_2D, null);

        ArgumentCaptor<PutObjectRequest> putRequest = ArgumentCaptor.forClass(PutObjectRequest.class);
        ArgumentCaptor<DeleteObjectRequest> deleteRequest = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3Client).putObject(putRequest.capture(), any(RequestBody.class));
        verify(s3Client).deleteObject(deleteRequest.capture());
        assertThat(deleteRequest.getValue().key()).isEqualTo(putRequest.getValue().key());
    }

    @Test
    @DisplayName("원본 S3 읽기 실패는 SOURCE_IMAGE_LOAD_FAILED로 기록한다")
    void generate_recordsSourceImageLoadFailure() {
        JarAiGenerationService service = service();
        arrangeStart(JarAiStyle.CUTE_2D);
        when(s3Client.getObject(any(GetObjectRequest.class))).thenThrow(SdkClientException.create("offline"));

        service.generate(1L, 10L, JarAiStyle.CUTE_2D, null);

        verify(persistenceService).completeFailed(10L, 100L,
                JarAiGenerationErrorCode.SOURCE_IMAGE_LOAD_FAILED, "Draft 원본 이미지를 읽을 수 없습니다.");
        verifyNoInteractions(cloudflareClient);
    }

    @Test
    @DisplayName("후보 S3 업로드 실패는 성공 처리 없이 S3_UPLOAD_FAILED로 기록하고 같은 Key 삭제를 시도한다")
    void generate_recordsCandidateUploadFailure() throws Exception {
        JarAiGenerationService service = service();
        arrangeStart(JarAiStyle.CUTE_2D);
        arrangeCandidateKey();
        arrangeOriginalRead("original".getBytes(StandardCharsets.UTF_8));
        when(cloudflareClient.generateImage(any())).thenReturn("provider".getBytes(StandardCharsets.UTF_8));
        when(generatedImageValidator.validateAndNormalize(any())).thenReturn("normalized".getBytes(StandardCharsets.UTF_8));
        doThrow(SdkClientException.create("S3 unavailable"))
                .when(s3Client).putObject(any(PutObjectRequest.class), any(RequestBody.class));

        service.generate(1L, 10L, JarAiStyle.CUTE_2D, null);

        verify(persistenceService).completeFailed(10L, 100L,
                JarAiGenerationErrorCode.S3_UPLOAD_FAILED, "AI 후보 이미지를 저장하지 못했습니다.");
        verify(persistenceService, never()).completeSucceeded(anyLong(), anyLong(), anyString());
        // S3는 저장 성공 후 응답만 실패할 수 있으므로, 모호한 업로드 실패에도 이 요청의 결정적 Key를 보상 삭제한다.
        verify(s3Client).deleteObject(argThat((DeleteObjectRequest request) -> request.key().equals("candidate.png")));
    }

    private JarAiGenerationService service() {
        S3Properties s3Properties = new S3Properties();
        s3Properties.setBucket("test-bucket");
        AiDraftProperties draftProperties = new AiDraftProperties();
        draftProperties.setMaxOriginalImageSize(10 * 1024 * 1024L);
        return new JarAiGenerationService(persistenceService, promptCatalog, cloudflareClient,
                generatedImageValidator, pixelPostProcessor, moderationService, s3KeyFactory, s3Client, s3Properties,
                draftProperties);
    }

    private void arrangeStart(JarAiStyle style) {
        AiPromptCatalog.AiPromptDefinition definition = style == JarAiStyle.PIXEL
                ? new AiPromptCatalog.AiPromptDefinition("test prompt", "PIXEL_V5", "PIXEL_REF_V1",
                PixelPostProcessor.POSTPROCESS_VERSION, "ai/references/pixel-reference-v1.png")
                : new AiPromptCatalog.AiPromptDefinition("test prompt", "BASE_V1+CUTE_2D_V1", null, null, null);
        when(promptCatalog.resolve(style)).thenReturn(definition);
        when(persistenceService.start(eq(1L), eq(10L), eq(style), eq(definition), any()))
                .thenReturn(new JarAiGenerationPersistenceService.GenerationStartTarget(100L, 10L, 1L, "original.png"));
    }

    private void arrangeCandidateKey() {
        when(s3KeyFactory.candidateKey(1L, 10L, 100L)).thenReturn("candidate.png");
    }

    private void arrangeOriginalRead(byte[] bytes) throws Exception {
        when(s3Client.getObject(any(GetObjectRequest.class))).thenReturn(originalInput);
        when(originalInput.readNBytes(anyInt())).thenReturn(bytes);
    }
}
