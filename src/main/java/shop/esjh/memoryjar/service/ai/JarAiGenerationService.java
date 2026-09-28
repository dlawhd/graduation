package shop.esjh.memoryjar.service.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
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

    private static final Logger log = LoggerFactory.getLogger(JarAiGenerationService.class);

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
    private final JarAiGenerationRealtimeService realtimeService;

    public JarAiGenerationService(JarAiGenerationPersistenceService persistenceService,
                                  AiPromptCatalog promptCatalog,
                                  CloudflareWorkersAiClient cloudflareClient,
                                  GeneratedAiImageValidator generatedImageValidator,
                                  PixelPostProcessor pixelPostProcessor,
                                  DraftOriginalImageModerationService moderationService,
                                  AiDraftS3KeyFactory s3KeyFactory,
                                  S3Client s3Client,
                                  S3Properties s3Properties,
                                  AiDraftProperties draftProperties,
                                  JarAiGenerationRealtimeService realtimeService) {
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
        this.realtimeService = realtimeService;
    }

    /**
     * 짧은 DB 트랜잭션으로 PROCESSING Generation을 먼저 만들고 백그라운드 작업 정보를 반환한다.
     * 이 메서드가 끝난 뒤 HTTP 요청은 즉시 202 응답을 보낼 수 있다.
     */
    public GenerationTask start(Long userId, Long draftId, JarAiStyle style, Long seed) {
        long requestedAtNanos = System.nanoTime();
        AiPromptCatalog.AiPromptDefinition definition = promptCatalog.resolve(style);
        JarAiGenerationPersistenceService.GenerationStartTarget target = persistenceService.start(
                userId, draftId, style, definition, seed);
        long queuedAtNanos = System.nanoTime();
        return new GenerationTask(target, definition, style, seed, requestedAtNanos, queuedAtNanos);
    }

    /**
     * S3·Cloudflare·이미지 처리·Rekognition을 HTTP 트랜잭션 밖의 제한된 실행기에서 순서대로 수행한다.
     * 각 단계 시간만 기록하며 프롬프트, 이미지, Token 같은 민감한 값은 로그에 남기지 않는다.
     */
    public void process(GenerationTask task) {
        JarAiGenerationPersistenceService.GenerationStartTarget target = task.target();
        JarAiStyle style = task.style();
        AiPromptCatalog.AiPromptDefinition definition = task.definition();
        StageTimings timings = new StageTimings();
        long processStartedAtNanos = System.nanoTime();
        String generatedS3Key = null;
        boolean completed = false;
        String outcome = "INTERNAL_ERROR";

        try {
            long stageStartedAtNanos = System.nanoTime();
            byte[] originalImage;
            try {
                originalImage = loadOriginalImage(target.originalS3Key());
            } finally {
                timings.s3GetMs = elapsedMillis(stageStartedAtNanos);
            }

            stageStartedAtNanos = System.nanoTime();
            byte[] generatedImage;
            try {
                generatedImage = cloudflareClient.generateImage(
                        new CloudflareWorkersAiClient.CloudflareImageGenerationRequest(
                                definition.prompt(), cloudflareInputs(originalImage, definition), task.seed()));
            } finally {
                timings.cloudflareMs = elapsedMillis(stageStartedAtNanos);
            }

            stageStartedAtNanos = System.nanoTime();
            byte[] normalizedCandidate;
            try {
                normalizedCandidate = generatedImageValidator.validateAndNormalize(generatedImage);
            } finally {
                timings.pngNormalizeMs = elapsedMillis(stageStartedAtNanos);
            }

            byte[] finalCandidate = normalizedCandidate;
            if (style == JarAiStyle.PIXEL) {
                stageStartedAtNanos = System.nanoTime();
                try {
                    finalCandidate = pixelPostProcessor.postProcess(normalizedCandidate);
                } finally {
                    timings.pixelPostprocessMs = elapsedMillis(stageStartedAtNanos);
                }
            } else {
                timings.pixelPostprocessMs = 0L;
            }

            // 심사한 후보와 S3에 저장할 후보가 달라지지 않게 최종 PNG 바이트를 그대로 심사한다.
            stageStartedAtNanos = System.nanoTime();
            try {
                moderationService.verifyAllowed(finalCandidate);
            } finally {
                timings.rekognitionMs = elapsedMillis(stageStartedAtNanos);
            }

            generatedS3Key = s3KeyFactory.candidateKey(target.ownerId(), target.draftId(), target.generationId());
            stageStartedAtNanos = System.nanoTime();
            try {
                putCandidate(generatedS3Key, finalCandidate);
            } finally {
                timings.s3PutMs = elapsedMillis(stageStartedAtNanos);
            }

            stageStartedAtNanos = System.nanoTime();
            try {
                completed = persistenceService.completeSucceeded(
                        target.draftId(), target.generationId(), generatedS3Key);
            } finally {
                timings.dbCompleteMs = elapsedMillis(stageStartedAtNanos);
            }
            outcome = completed ? "SUCCEEDED" : "STALE";
            if (completed) {
                realtimeService.sendCompleted(target.draftId(), target.generationId(), style,
                        JarAiGenerationStatus.SUCCEEDED, null);
            }
        } catch (SourceImageLoadException exception) {
            outcome = recordFailure(target, style, JarAiGenerationErrorCode.SOURCE_IMAGE_LOAD_FAILED,
                    "Draft 원본 이미지를 읽을 수 없습니다.");
        } catch (CloudflareWorkersAiClient.CloudflareAiClientException exception) {
            outcome = recordFailure(target, style, mapCloudflareFailure(exception.getFailureType()),
                    "AI 제공자 요청 또는 응답 검증에 실패했습니다.");
        } catch (GeneratedAiImageValidator.InvalidGeneratedAiImageException exception) {
            outcome = recordFailure(target, style, JarAiGenerationErrorCode.PROVIDER_INVALID_RESPONSE,
                    "AI 결과 이미지가 후보 규격을 충족하지 않습니다.");
        } catch (PixelPostProcessor.InvalidPixelPostprocessException exception) {
            outcome = recordFailure(target, style, JarAiGenerationErrorCode.PIXEL_POSTPROCESS_FAILED,
                    "PIXEL 후보 후처리에 실패했습니다.");
        } catch (CandidateUploadException exception) {
            outcome = recordFailure(target, style, JarAiGenerationErrorCode.S3_UPLOAD_FAILED,
                    "AI 후보 이미지를 저장하지 못했습니다.");
        } catch (RuntimeException exception) {
            outcome = recordFailure(target, style, JarAiGenerationErrorCode.INTERNAL_ERROR,
                    "AI 후보 생성 중 내부 오류가 발생했습니다.");
        } finally {
            // 업로드 뒤 stale/종료 상태가 확인되면 DB에는 Key를 남기지 않고 객체만 즉시 보상 삭제한다.
            if (generatedS3Key != null && !completed) {
                deleteUncommittedCandidate(generatedS3Key);
            }
            logTiming(task, processStartedAtNanos, timings, outcome);
        }
    }

    /** 실행기 대기열이 가득 찬 경우 생성 상태를 실패로 닫아 PROCESSING 행이 남지 않게 한다. */
    public void failQueueRejected(GenerationTask task) {
        String outcome = recordFailure(task.target(), task.style(), JarAiGenerationErrorCode.GENERATION_QUEUE_FULL,
                "AI 생성 대기열이 가득 찼습니다.");
        logTiming(task, System.nanoTime(), new StageTimings(), "QUEUE_REJECTED_" + outcome);
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

    private String recordFailure(JarAiGenerationPersistenceService.GenerationStartTarget target,
                                 JarAiStyle style, JarAiGenerationErrorCode errorCode, String errorMessage) {
        boolean changed = persistenceService.completeFailed(
                target.draftId(), target.generationId(), errorCode, errorMessage);
        if (changed) {
            realtimeService.sendCompleted(target.draftId(), target.generationId(), style,
                    JarAiGenerationStatus.FAILED, errorCode);
        }
        return changed ? "FAILED_" + errorCode.name() : "STALE_" + errorCode.name();
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

    private void logTiming(GenerationTask task, long processStartedAtNanos,
                           StageTimings timings, String outcome) {
        log.info("[AI_GENERATION_TIMING] draftId={} generationId={} style={} outcome={} "
                        + "dbStartMs={} queueWaitMs={} s3GetMs={} cloudflareMs={} pngNormalizeMs={} "
                        + "pixelPostprocessMs={} rekognitionMs={} s3PutMs={} dbCompleteMs={} totalMs={}",
                task.target().draftId(), task.target().generationId(), task.style(), outcome,
                nanosToMillis(task.queuedAtNanos() - task.requestedAtNanos()),
                nanosToMillis(Math.max(0L, processStartedAtNanos - task.queuedAtNanos())),
                timings.s3GetMs, timings.cloudflareMs, timings.pngNormalizeMs,
                timings.pixelPostprocessMs, timings.rekognitionMs, timings.s3PutMs,
                timings.dbCompleteMs, nanosToMillis(System.nanoTime() - task.requestedAtNanos()));
    }

    private long elapsedMillis(long startedAtNanos) {
        return nanosToMillis(System.nanoTime() - startedAtNanos);
    }

    private long nanosToMillis(long nanos) {
        return Math.max(0L, nanos / 1_000_000L);
    }

    /** 백그라운드 실행에 필요한 값만 담아 JPA Entity가 작업 스레드로 넘어가지 않게 한다. */
    public record GenerationTask(
            JarAiGenerationPersistenceService.GenerationStartTarget target,
            AiPromptCatalog.AiPromptDefinition definition,
            JarAiStyle style,
            Long seed,
            long requestedAtNanos,
            long queuedAtNanos
    ) {
    }

    private static class StageTimings {
        private long s3GetMs = -1L;
        private long cloudflareMs = -1L;
        private long pngNormalizeMs = -1L;
        private long pixelPostprocessMs = -1L;
        private long rekognitionMs = -1L;
        private long s3PutMs = -1L;
        private long dbCompleteMs = -1L;
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
