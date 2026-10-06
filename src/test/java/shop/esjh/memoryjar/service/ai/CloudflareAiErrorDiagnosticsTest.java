package shop.esjh.memoryjar.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/** 오류 원문 대신 고정된 구조와 원인 신호만 남기며, 진단 때문에 오류 분류가 바뀌지 않는지 검증한다. */
class CloudflareAiErrorDiagnosticsTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @ParameterizedTest
    @CsvSource({
            "AiError: Input prompt contains NSFW content. PRIVATE_DETAIL, INPUT_PROMPT_POLICY",
            "AiError: Input image contains NSFW content: PRIVATE_DETAIL, INPUT_IMAGE_POLICY",
            "AiError: Output image contains NSFW content (PRIVATE_DETAIL), OUTPUT_IMAGE_POLICY",
            "AiError: Model input is not valid: PRIVATE_DETAIL, MODEL_INPUT_INVALID",
            "AiError: PRIVATE_DETAIL, AI_ERROR_UNRECOGNIZED",
            "PRIVATE_DETAIL with NSFW in quoted prompt, MESSAGE_UNRECOGNIZED",
            "Input prompt contains NSFW contentment PRIVATE_DETAIL, MESSAGE_UNRECOGNIZED"
    })
    void emitsOnlyAllowlistedSignals(String message, String signal) {
        var envelope = mapper.createObjectNode();
        envelope.putArray("errors").addObject().put("code", 3030).put("message", message);
        assertThat(CloudflareAiErrorDiagnostics.describe(envelope))
                .contains("root=OBJECT", "errors=ARRAY", "errorCount=1", "signals=[" + signal + "]")
                .doesNotContain("PRIVATE_DETAIL", "AiError:", "NSFW", message);
    }

    @Test
    void showsConflictingSignalsButKeepsGenericFailure() throws Exception {
        var envelope = mapper.readTree("""
                {"success":false,"errors":[
                {"code":3030,"message":"Input image contains NSFW content. PRIVATE_DETAIL"},
                {"code":3030,"message":"Model input is not valid: PRIVATE_DETAIL"}]}
                """);
        assertThat(CloudflareAiErrorDiagnostics.describe(envelope))
                .contains("success=FALSE", "INPUT_IMAGE_POLICY", "MODEL_INPUT_INVALID")
                .doesNotContain("PRIVATE_DETAIL");
        assertThat(CloudflareAiFailureClassifier.classify(400, envelope))
                .isEqualTo(CloudflareWorkersAiClient.FailureType.REQUEST_FAILED);
    }

    @Test
    void showsAlternateMessageLocationWithoutTrustingItAsClassification() throws Exception {
        var envelope = mapper.readTree("""
                {"errors":{"PRIVATE_FIELD":{"code":3030}},
                 "message":"Input image contains NSFW content. PRIVATE_DETAIL",
                 "result":{"error":"PRIVATE_DETAIL"}}
                """);
        assertThat(CloudflareAiErrorDiagnostics.describe(envelope))
                .contains("errors=OBJECT", "errorCount=0", "topMessage=TEXT", "topSignals=[INPUT_IMAGE_POLICY]")
                .doesNotContain("PRIVATE_FIELD", "PRIVATE_DETAIL");
        assertThat(CloudflareAiFailureClassifier.classify(400, envelope))
                .isEqualTo(CloudflareWorkersAiClient.FailureType.REQUEST_FAILED);
    }

    @Test
    void reportsUnusableMessagesAndBoundedScanWithoutLoggingTheirValues() {
        var envelope = mapper.createObjectNode();
        var errors = envelope.putArray("errors");
        errors.addObject().put("code", 3030);
        errors.addObject().put("code", 3030).put("message", 123);
        errors.addObject().put("code", 3030).put("message", " ");
        errors.addObject().put("code", 3030).put("message", "PRIVATE_DETAIL".repeat(200));
        for (int index = 4; index < 20; index++) errors.addObject().put("code", 3030);
        errors.addObject().put("code", 3030).put("message", "Input image contains NSFW content");
        assertThat(CloudflareAiErrorDiagnostics.describe(envelope))
                .contains("errorCount=21", "errorScanLimited=true", "MESSAGE_ABSENT", "MESSAGE_NOT_TEXT",
                        "MESSAGE_EMPTY", "MESSAGE_TOO_LONG")
                .doesNotContain("PRIVATE_DETAIL", "INPUT_IMAGE_POLICY");
    }

    @ParameterizedTest
    @CsvSource({
            "AiError: AiError: Your output has been flagged. Please choose another prompt / input image combination (00000000-0000-4000-8000-000000000001), OUTPUT_IMAGE_FLAGGED",
            "Your output has been flagged. Please choose another prompt / input image combination, OUTPUT_IMAGE_FLAGGED",
            "AIERROR: YOUR OUTPUT HAS BEEN FLAGGED. PLEASE CHOOSE ANOTHER PROMPT / INPUT IMAGE COMBINATION, OUTPUT_IMAGE_FLAGGED",
            "AiError: Your output has been flagged. Please choose another prompt / input image combination PRIVATE_DETAIL, AI_ERROR_UNRECOGNIZED",
            "AiError: Your output has been flagged. Please choose another prompt / input image combination (PRIVATE_DETAIL), AI_ERROR_UNRECOGNIZED",
            "AiError: Your output has been flagged. Please choose another prompt, AI_ERROR_UNRECOGNIZED",
            "PRIVATE_DETAIL quotes Your output has been flagged. Please choose another prompt / input image combination, MESSAGE_UNRECOGNIZED"
    })
    void outputFlaggedKeepsOnlyFixedSignalWithoutInferringInputOrNsfw(String message, String expected) {
        var envelope = mapper.createObjectNode();
        envelope.putArray("errors").addObject().put("code", 3030).put("message", message);
        assertThat(CloudflareAiErrorDiagnostics.describe(envelope))
                .contains("signals=[" + expected + "]")
                .doesNotContain(message, "PRIVATE_DETAIL", "00000000-0000-4000-8000-000000000001",
                        "INPUT_IMAGE_POLICY", "INPUT_PROMPT_POLICY", "OUTPUT_IMAGE_POLICY");
    }
}
