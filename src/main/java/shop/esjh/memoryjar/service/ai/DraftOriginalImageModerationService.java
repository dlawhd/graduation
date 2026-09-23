package shop.esjh.memoryjar.service.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.rekognition.model.DetectModerationLabelsRequest;
import software.amazon.awssdk.services.rekognition.model.Image;
import software.amazon.awssdk.services.rekognition.model.RekognitionException;

/**
 * AWS Rekognition으로 원본 이미지의 부적절 콘텐츠를 동기 심사한다.
 * 심사 결과를 받지 못하면 안전을 위해 업로드를 허용하지 않는다.
 */
@Service
public class DraftOriginalImageModerationService {

    private static final Logger log = LoggerFactory.getLogger(DraftOriginalImageModerationService.class);

    private final RekognitionClient rekognitionClient;
    private final AiDraftProperties properties;

    public DraftOriginalImageModerationService(RekognitionClient rekognitionClient, AiDraftProperties properties) {
        this.rekognitionClient = rekognitionClient;
        this.properties = properties;
    }

    /**
     * 최소 신뢰도 이상 라벨이 발견되면 부적절 콘텐츠로 보고 차단한다.
     */
    public void verifyAllowed(byte[] imageBytes) {
        try {
            var response = rekognitionClient.detectModerationLabels(
                    DetectModerationLabelsRequest.builder()
                            .image(Image.builder().bytes(SdkBytes.fromByteArray(imageBytes)).build())
                            .minConfidence(properties.getModerationMinConfidence())
                            .build()
            );

            if (!response.moderationLabels().isEmpty()) {
                throw new ApiException(AiDraftErrorCode.DRAFT_CONTENT_POLICY_REJECTED);
            }
        } catch (RekognitionException exception) {
            // 응답 메시지에는 계정·네트워크 상세가 섞일 수 있어 남기지 않고, AWS가 준 안전한 진단값만 traceId 로그에 남긴다.
            log.warn("Draft 원본 Rekognition 심사 호출이 실패했습니다. status={} awsErrorCode={} awsRequestId={}",
                    exception.statusCode(), awsErrorCode(exception), exception.requestId());
            throw new ApiException(AiDraftErrorCode.DRAFT_MODERATION_UNAVAILABLE);
        } catch (SdkClientException exception) {
            // 자격 증명 탐색·DNS·연결·timeout 같은 클라이언트 오류도 운영 정책상 fail-closed 한다.
            log.warn("Draft 원본 Rekognition 심사 클라이언트 오류입니다. rootCauseType={}", rootCauseType(exception));
            throw new ApiException(AiDraftErrorCode.DRAFT_MODERATION_UNAVAILABLE);
        }
    }

    private String awsErrorCode(RekognitionException exception) {
        return exception.awsErrorDetails() == null || exception.awsErrorDetails().errorCode() == null
                ? "unknown" : exception.awsErrorDetails().errorCode();
    }

    /** 예외 원문 대신 타입만 남겨 자격 증명·경로 등 민감한 SDK 메시지가 로그로 새지 않게 한다. */
    private String rootCauseType(Throwable exception) {
        Throwable root = exception;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName();
    }
}
