package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.rekognition.model.DetectModerationLabelsRequest;
import software.amazon.awssdk.services.rekognition.model.DetectModerationLabelsResponse;
import software.amazon.awssdk.services.rekognition.model.ModerationLabel;
import software.amazon.awssdk.services.rekognition.model.RekognitionException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Rekognition 동기 심사가 부적절 콘텐츠와 API 실패를 모두 fail-closed로 처리하는지 검증한다.
 */
class DraftOriginalImageModerationServiceTest {

    private final RekognitionClient rekognitionClient = mock(RekognitionClient.class);
    private final DraftOriginalImageModerationService moderationService =
            new DraftOriginalImageModerationService(rekognitionClient, properties());

    @Test
    void verifyAllowed_allowsImageWithoutModerationLabel() {
        when(rekognitionClient.detectModerationLabels(any(DetectModerationLabelsRequest.class))).thenReturn(
                DetectModerationLabelsResponse.builder().moderationLabels(List.of()).build());

        assertThatCode(() -> moderationService.verifyAllowed(new byte[]{1, 2, 3})).doesNotThrowAnyException();
    }

    @Test
    void verifyAllowed_rejectsImageWithModerationLabel() {
        when(rekognitionClient.detectModerationLabels(any(DetectModerationLabelsRequest.class))).thenReturn(
                DetectModerationLabelsResponse.builder()
                        .moderationLabels(ModerationLabel.builder().name("Explicit Nudity").confidence(99F).build())
                        .build());

        assertThatThrownBy(() -> moderationService.verifyAllowed(new byte[]{1, 2, 3}))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    }

    @Test
    void verifyAllowed_blocksUploadWhenRekognitionFails() {
        when(rekognitionClient.detectModerationLabels(any(DetectModerationLabelsRequest.class))).thenThrow(
                RekognitionException.builder().message("service unavailable").build());

        assertThatThrownBy(() -> moderationService.verifyAllowed(new byte[]{1, 2, 3}))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    private AiDraftProperties properties() {
        AiDraftProperties properties = new AiDraftProperties();
        properties.setModerationMinConfidence(80F);
        return properties;
    }
}
