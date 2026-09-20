package shop.esjh.memoryjar.service.ai;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.config.properties.S3Properties;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Draft 기반 AI 후보 생성 전체 흐름을 조정한다.
 * DB 상태 변경은 별도 Persistence Service에서 짧게 끝내고, S3·Cloudflare 호출은 트랜잭션 밖에서 수행한다.
 */
@Service
public class JarAiGenerationService {

    private final JarAiGenerationPersistenceService persistenceService;
    private final AiPromptCatalog promptCatalog;
    private final CloudflareWorkersAiClient cloudflareClient;
    private final GeneratedAiImageValidator generatedImageValidator;
    private final PixelPostProcessor pixelPostProcessor;
    private final DraftOriginalImageModerationService moderationService;
    private final AiDraftS3KeyFactory s3KeyFactory;
    private final S3Client s3Client;
    private final S3Properties s3Properties;
    private final AiDraftProperties draftProperties;

    public JarAiGenerationService(JarAiGenerationPersistenceService persistenceService,
                                  AiPromptCatalog promptCatalog,
                                  CloudflareWorkersAiClient cloudflareClient,
                                  GeneratedAiImageValidator generatedImageValidator,
                                  PixelPostProcessor pixelPostProcessor,
                                  DraftOriginalImageModerationService moderationService,
                                  AiDraftS3KeyFactory s3KeyFactory,
                                  S3Client s3Client,
                                  S3Properties s3Properties,
                                  AiDraftProperties draftProperties) {
        this.persistenceService = persistenceService;
        this.promptCatalog = promptCatalog;
        this.cloudflareClient = cloudflareClient;
        this.generatedImageValidator = generatedImageValidator;
        this.pixelPostProcessor = pixelPostProcessor;
        this.moderationService = moderationService;
        this.s3KeyFactory = s3KeyFactory;
        this.s3Client = s3Client;
        this.s3Properties = s3Properties;
        this.draftProperties = draftProperties;
    }

    /**
     * 서버가 선택한 Prompt/Reference 버전으로 AI 후보를 생성한다.
     * 실패는 해당 Generation에 기록하며, 시작·권한·중복 오류만 호출자에게 그대로 전달한다.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Long generate(Long userId, Long draftId, JarAiStyle style, Long seed) {
        AiPromptCatalog.AiPromptDefinition definition = promptCatalog.resolve(style);
        JarAiGenerationPersistenceService.GenerationStartTarget target = persistenceService.start(
                userId, draftId, style, definition, seed);
        String generatedS3Key = null;
        boolean completed = false;

        try {
            byte[] originalImage = loadOriginalImage(target.originalS3Key());
            byte[] generatedImage = cloudflareClient.generateImage(new CloudflareWorkersAiClient.CloudflareImageGenerationRequest(
                    definition.prompt(), cloudflareInputs(originalImage, definition), seed));
            byte[] normalizedCandidate = generatedImageValidator.validateAndNormalize(generatedImage);
            byte[] finalCandidate = style == JarAiStyle.PIXEL
                    ? pixelPostProcessor.postProcess(normalizedCandidate)
                    : normalizedCandidate;
            // 심사한 후보와 S3에 저장할 후보가 달라지지 않게 최종 PNG 바이트를 그대로 심사한다.
            moderationService.verifyAllowed(finalCandidate);

            generatedS3Key = s3KeyFactory.candidateKey(target.ownerId(), target.draftId(), target.generationId());
            putCandidate(generatedS3Key, finalCandidate);
            completed = persistenceService.completeSucceeded(target.draftId(), target.generationId(), generatedS3Key);
            return target.generationId();
        } catch (SourceImageLoadException exception) {
            recordFailure(target, JarAiGenerationErrorCode.SOURCE_IMAGE_LOAD_FAILED,
                    "Draft 원본 이미지를 읽을 수 없습니다.");
            return target.generationId();
        } catch (CloudflareWorkersAiClient.CloudflareAiClientException exception) {
            recordFailure(target, mapCloudflareFailure(exception.getFailureType()),
                    "AI 제공자 요청 또는 응답 검증에 실패했습니다.");
            return target.generationId();
        } catch (GeneratedAiImageValidator.InvalidGeneratedAiImageException exception) {
            recordFailure(target, JarAiGenerationErrorCode.PROVIDER_INVALID_RESPONSE,
                    "AI 결과 이미지가 후보 규격을 충족하지 않습니다.");
            return target.generationId();
        } catch (PixelPostProcessor.InvalidPixelPostprocessException exception) {
            recordFailure(target, JarAiGenerationErrorCode.PIXEL_POSTPROCESS_FAILED,
                    "PIXEL 후보 후처리에 실패했습니다.");
            return target.generationId();
        } catch (CandidateUploadException exception) {
            recordFailure(target, JarAiGenerationErrorCode.S3_UPLOAD_FAILED,
                    "AI 후보 이미지를 저장하지 못했습니다.");
            return target.generationId();
        } catch (RuntimeException exception) {
            recordFailure(target, JarAiGenerationErrorCode.INTERNAL_ERROR,
                    "AI 후보 생성 중 내부 오류가 발생했습니다.");
            return target.generationId();
        } finally {
            // 업로드 뒤 stale/종료 상태가 확인되면 DB에는 Key를 남기지 않고 객체만 즉시 보상 삭제한다.
            if (generatedS3Key != null && !completed) {
                deleteUncommittedCandidate(generatedS3Key);
            }
        }
    }

    private List<CloudflareWorkersAiClient.CloudflareImageInput> cloudflareInputs(
            byte[] originalImage, AiPromptCatalog.AiPromptDefinition definition) {
        List<CloudflareWorkersAiClient.CloudflareImageInput> inputs = new ArrayList<>();
        inputs.add(new CloudflareWorkersAiClient.CloudflareImageInput("draft-original.png", originalImage));
        definition.referenceImageResourcePathOptional().ifPresent(path -> inputs.add(
                new CloudflareWorkersAiClient.CloudflareImageInput("pixel-reference.png",
                        promptCatalog.loadReferenceImage(definition))));
        return List.copyOf(inputs);
    }

    private byte[] loadOriginalImage(String originalS3Key) {
        long maxBytes = draftProperties.getMaxOriginalImageSize();
        if (maxBytes < 1 || maxBytes >= Integer.MAX_VALUE) {
            throw new SourceImageLoadException();
        }
        try (ResponseInputStream<GetObjectResponse> input = s3Client.getObject(GetObjectRequest.builder()
                .bucket(s3Properties.getBucket())
                .key(originalS3Key)
                .build())) {
            byte[] image = input.readNBytes((int) maxBytes + 1);
            if (image.length > maxBytes) {
                throw new SourceImageLoadException();
            }
            return image;
        } catch (IOException | S3Exception | SdkClientException exception) {
            throw new SourceImageLoadException(exception);
        }
    }

    private void putCandidate(String s3Key, byte[] candidateImage) {
        try {
            s3Client.putObject(PutObjectRequest.builder()
                            .bucket(s3Properties.getBucket())
                            .key(s3Key)
                            .contentType("image/png")
                            .ifNoneMatch("*")
                            .build(),
                    RequestBody.fromBytes(candidateImage));
        } catch (S3Exception | SdkClientException exception) {
            throw new CandidateUploadException(exception);
        }
    }

    private void recordFailure(JarAiGenerationPersistenceService.GenerationStartTarget target,
                               JarAiGenerationErrorCode errorCode, String errorMessage) {
        persistenceService.completeFailed(target.draftId(), target.generationId(), errorCode, errorMessage);
    }

    private JarAiGenerationErrorCode mapCloudflareFailure(CloudflareWorkersAiClient.FailureType failureType) {
        return switch (failureType) {
            case RATE_LIMITED -> JarAiGenerationErrorCode.PROVIDER_RATE_LIMITED;
            case TIMEOUT -> JarAiGenerationErrorCode.PROVIDER_TIMEOUT;
            case INVALID_RESPONSE -> JarAiGenerationErrorCode.PROVIDER_INVALID_RESPONSE;
            case REQUEST_FAILED -> JarAiGenerationErrorCode.PROVIDER_REQUEST_FAILED;
        };
    }

    private void deleteUncommittedCandidate(String s3Key) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(s3Properties.getBucket())
                    .key(s3Key)
                    .build());
        } catch (S3Exception | SdkClientException ignored) {
            // 실패한 보상 삭제는 다음 stale/cleanup 단계에서 다시 점검할 대상이다.
        }
    }

    private static class SourceImageLoadException extends RuntimeException {
        private SourceImageLoadException() {
        }

        private SourceImageLoadException(Throwable cause) {
            super(cause);
        }
    }

    private static class CandidateUploadException extends RuntimeException {
        private CandidateUploadException(Throwable cause) {
            super(cause);
        }
    }
}
