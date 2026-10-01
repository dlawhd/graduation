package shop.esjh.memoryjar.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/** 외부 오류 원문 없이도 검증된 사유만 분류하고, 모호한 3030은 추측하지 않는지 검증한다. */
class CloudflareAiFailureClassifierTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @ParameterizedTest
    @CsvSource({
            "400, 3030, AiError: Input prompt contains NSFW content, CONTENT_POLICY_REJECTED",
            "200, 3030, AiError: AiError: Input prompt contains NSFW content, CONTENT_POLICY_REJECTED",
            "400, 3030, AiError: Input image contains NSFW content., CONTENT_POLICY_REJECTED",
            "400, 3030, AiError: Output image contains NSFW content (request-id), CONTENT_POLICY_REJECTED",
            "400, 3030, AiError: Model input is not valid: missing required input mask_image, INPUT_INVALID",
            "400, 3030, unknown model execution failure, REQUEST_FAILED",
            "400, 3030, Provider failed for prompt: No NSFW content, REQUEST_FAILED",
            "400, 3030, Input prompt contains NSFW contentment, REQUEST_FAILED",
            "403, 3030, AiError: Input prompt contains NSFW content, REQUEST_FAILED",
            "400, 5004, invalid input data, INPUT_INVALID",
            "400, 3003, incomplete request, INPUT_INVALID",
            "413, 3006, request too large, INPUT_INVALID",
            "408, 3030, unknown error, TIMEOUT",
            "200, 3007, timeout, TIMEOUT",
            "429, 3036, quota detail, QUOTA_EXCEEDED",
            "429, 3040, capacity detail, CAPACITY_EXCEEDED",
            "200, 3040, capacity detail, CAPACITY_EXCEEDED",
            "429, 9999, unknown limit, RATE_LIMITED"
    })
    void classifiesOnlyExplicitEvidence(int status, String code, String message,
                                       CloudflareWorkersAiClient.FailureType expected) {
        var envelope = mapper.createObjectNode();
        envelope.putArray("errors").addObject().put("code", code).put("message", message);
        assertThat(CloudflareAiFailureClassifier.classify(status, envelope)).isEqualTo(expected);
    }

    @Test
    void ambiguous3030AndMissingEnvelopeRemainUnknown() throws Exception {
        assertThat(CloudflareAiFailureClassifier.classify(400, mapper.readTree("""
                {"errors":[{"code":3030,"message":"Input prompt contains NSFW content"},
                  {"code":3030,"message":"Model input is not valid: invalid image"}]}
                """))).isEqualTo(CloudflareWorkersAiClient.FailureType.REQUEST_FAILED);
        assertThat(CloudflareAiFailureClassifier.classify(400, null))
                .isEqualTo(CloudflareWorkersAiClient.FailureType.REQUEST_FAILED);
        assertThat(CloudflareAiFailureClassifier.classify(400, mapper.readTree("{\"errors\":{\"message\":\"NSFW\"}}")))
                .isEqualTo(CloudflareWorkersAiClient.FailureType.REQUEST_FAILED);
    }

    @Test
    void excessiveMessageAndErrorsAreNotUsedToGuessReason() {
        var envelope = mapper.createObjectNode();
        var errors = envelope.putArray("errors");
        errors.addObject().put("code", "3030").put("message", "Input prompt contains NSFW content " + "x".repeat(2048));
        for (int index = 1; index < 20; index++) errors.addObject().put("code", "3030");
        errors.addObject().put("code", "3030").put("message", "Input prompt contains NSFW content");
        assertThat(CloudflareAiFailureClassifier.classify(400, envelope))
                .isEqualTo(CloudflareWorkersAiClient.FailureType.REQUEST_FAILED);
    }
}
