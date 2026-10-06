package shop.esjh.memoryjar.service.ai;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.HashSet;
import java.util.Set;

/**
 * Cloudflare 오류 응답을 제한된 내부 원인으로 변환한다.
 * 제공자 메시지는 메모리에서만 확인하고 반환·로그·DB에 원문을 보관하지 않는다.
 */
final class CloudflareAiFailureClassifier {

    private CloudflareAiFailureClassifier() { }

    /** 코드 3030은 여러 오류에 쓰이므로, 명시적인 제공자 설명이 없으면 일반 실패로 남긴다. */
    static CloudflareWorkersAiClient.FailureType classify(int status, JsonNode envelope) {
        Set<String> codes = new HashSet<>();
        boolean contentRejected = false;
        boolean inputInvalid = false;
        JsonNode errors = envelope == null ? null : envelope.path("errors");
        if (errors != null && errors.isArray()) {
            int inspected = 0;
            for (JsonNode error : errors) {
                if (inspected++ >= CloudflareAiErrorDiagnostics.MAX_ERRORS) break;
                String code = error.path("code").asText("");
                codes.add(code);
                // 3030 설명 중 확인된 문장만 허용한다. 단순 NSFW 단어·사용자 프롬프트 인용은 근거가 아니다.
                if ("3030".equals(code)) {
                    Set<CloudflareAiErrorDiagnostics.ReasonSignal> signals =
                            CloudflareAiErrorDiagnostics.reasonSignals(error.path("message"));
                    contentRejected |= signals.contains(CloudflareAiErrorDiagnostics.ReasonSignal.INPUT_PROMPT_POLICY)
                            || signals.contains(CloudflareAiErrorDiagnostics.ReasonSignal.INPUT_IMAGE_POLICY)
                            || signals.contains(CloudflareAiErrorDiagnostics.ReasonSignal.OUTPUT_IMAGE_POLICY);
                    inputInvalid |= signals.contains(CloudflareAiErrorDiagnostics.ReasonSignal.MODEL_INPUT_INVALID);
                }
            }
        }

        if (status == 408 || codes.contains("3007")) {
            return CloudflareWorkersAiClient.FailureType.TIMEOUT;
        }
        // 할당량 소진과 일시적인 제공자 용량 부족은 사용자의 대응 방법이 다르다.
        if (status == 429 || status == 200) {
            if (codes.contains("3036")) return CloudflareWorkersAiClient.FailureType.QUOTA_EXCEEDED;
            if (codes.contains("3040")) return CloudflareWorkersAiClient.FailureType.CAPACITY_EXCEEDED;
            if (status == 429) return CloudflareWorkersAiClient.FailureType.RATE_LIMITED;
        }
        if (status == 400 || status == 200 || status == 413) {
            inputInvalid |= status == 413 || codes.contains("5004") || codes.contains("3003") || codes.contains("3006");
            // 서로 다른 설명이 섞이면 한 원인으로 단정하지 않는다.
            if (contentRejected && !inputInvalid) return CloudflareWorkersAiClient.FailureType.CONTENT_POLICY_REJECTED;
            if (inputInvalid && !contentRejected) return CloudflareWorkersAiClient.FailureType.INPUT_INVALID;
        }
        return CloudflareWorkersAiClient.FailureType.REQUEST_FAILED;
    }

}
