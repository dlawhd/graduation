package shop.esjh.memoryjar.service.ai;

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
        } catch (RekognitionException | SdkClientException exception) {
            // API 오류·네트워크 오류·권한 오류는 모두 심사 미완료로 취급하여 fail-closed 한다.
            throw new ApiException(AiDraftErrorCode.DRAFT_MODERATION_UNAVAILABLE);
        }
    }
}
