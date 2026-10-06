package shop.esjh.memoryjar.service.ai;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 제공자 오류의 구조와 확인된 문장 종류만 진단한다.
 * 원문이나 임의의 JSON 필드 이름을 보관하지 않고, 숫자와 고정 enum으로만 로그를 만든다.
 */
final class CloudflareAiErrorDiagnostics {
    static final int MAX_ERRORS = 20;
    private static final int MAX_MESSAGE_LENGTH = 2048;
    // 실제 비교 응답에서 확인한 전체 문장만 허용한다. UUID는 형식만 검사하며 보관하지 않는다.
    // 'flagged'만으로 NSFW나 입력 이미지 문제를 추측하지 않는다.
    private static final Pattern OUTPUT_FLAGGED_MESSAGE = Pattern.compile(
            "your output has been flagged\\. please choose another prompt / input image combination"
                    + "(?: \\([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\))?");

    private CloudflareAiErrorDiagnostics() { }

    /** 어떤 형식의 오류가 왔는지 확인한다. 사용자 내용을 포함할 수 있는 값은 출력하지 않는다. */
    static String describe(JsonNode envelope) {
        JsonNode errors = envelope == null ? null : envelope.path("errors");
        Set<ReasonSignal> signals = EnumSet.noneOf(ReasonSignal.class);
        int textMessages = 0;
        if (errors != null && errors.isArray()) {
            int inspected = 0;
            for (JsonNode error : errors) {
                if (inspected++ >= MAX_ERRORS) break;
                if (error.path("message").isTextual()) textMessages++;
                if ("3030".equals(error.path("code").asText(""))) {
                    signals.addAll(reasonSignals(error.path("message")));
                }
            }
        }
        // 최상위 message는 별도로 표시한다. errors[].message와 계약이 달라 분류 근거로 쓰지 않는다.
        return "root=" + shape(envelope)
                + " success=" + successState(envelope)
                + " errors=" + shape(errors)
                + " errorCount=" + (errors != null && errors.isArray() ? errors.size() : 0)
                + " errorScanLimited=" + (errors != null && errors.isArray() && errors.size() > MAX_ERRORS)
                + " textMessages=" + textMessages
                + " signals=" + signals
                + " topMessage=" + shape(envelope == null ? null : envelope.path("message"))
                + " topSignals=" + reasonSignals(envelope == null ? null : envelope.path("message"));
    }

    /** 기존 분류기와 같은 엄격한 문장 경계를 사용하여, 단순 키워드나 인용문으로 원인을 추측하지 않는다. */
    static Set<ReasonSignal> reasonSignals(JsonNode value) {
        if (value == null || value.isMissingNode() || value.isNull()) return Set.of(ReasonSignal.MESSAGE_ABSENT);
        if (!value.isTextual()) return Set.of(ReasonSignal.MESSAGE_NOT_TEXT);
        if (value.textValue().length() > MAX_MESSAGE_LENGTH) return Set.of(ReasonSignal.MESSAGE_TOO_LONG);
        String message = value.textValue().strip().toLowerCase(Locale.ROOT);
        if (message.isEmpty()) return Set.of(ReasonSignal.MESSAGE_EMPTY);
        boolean aiErrorPrefix = message.startsWith("aierror:");
        while (message.startsWith("aierror:")) message = message.substring("aierror:".length()).stripLeading();
        if (OUTPUT_FLAGGED_MESSAGE.matcher(message).matches()) return Set.of(ReasonSignal.OUTPUT_IMAGE_FLAGGED);
        if (startsWithReason(message, "input prompt contains nsfw content")) return Set.of(ReasonSignal.INPUT_PROMPT_POLICY);
        if (startsWithReason(message, "input image contains nsfw content")) return Set.of(ReasonSignal.INPUT_IMAGE_POLICY);
        if (startsWithReason(message, "output image contains nsfw content")) return Set.of(ReasonSignal.OUTPUT_IMAGE_POLICY);
        if (message.startsWith("model input is not valid:")) return Set.of(ReasonSignal.MODEL_INPUT_INVALID);
        return Set.of(aiErrorPrefix ? ReasonSignal.AI_ERROR_UNRECOGNIZED : ReasonSignal.MESSAGE_UNRECOGNIZED);
    }

    private static Shape shape(JsonNode value) {
        if (value == null || value.isMissingNode()) return Shape.ABSENT;
        if (value.isNull()) return Shape.NULL;
        if (value.isObject()) return Shape.OBJECT;
        if (value.isArray()) return Shape.ARRAY;
        if (value.isTextual()) return Shape.TEXT;
        if (value.isBoolean()) return Shape.BOOLEAN;
        if (value.isNumber()) return Shape.NUMBER;
        return Shape.OTHER;
    }

    private static String successState(JsonNode envelope) {
        JsonNode value = envelope == null ? null : envelope.path("success");
        if (value != null && value.isBoolean()) return value.booleanValue() ? "TRUE" : "FALSE";
        return shape(value).name();
    }

    private static boolean startsWithReason(String message, String reason) {
        if (!message.startsWith(reason)) return false;
        if (message.length() == reason.length()) return true;
        char next = message.charAt(reason.length());
        return Character.isWhitespace(next) || next == '.' || next == ':' || next == '(';
    }

    enum BodyState { JSON, EMPTY, NON_JSON, TOO_LARGE }
    enum ReasonSignal {
        INPUT_PROMPT_POLICY, INPUT_IMAGE_POLICY, OUTPUT_IMAGE_POLICY, OUTPUT_IMAGE_FLAGGED, MODEL_INPUT_INVALID,
        MESSAGE_ABSENT, MESSAGE_NOT_TEXT, MESSAGE_EMPTY, MESSAGE_TOO_LONG,
        AI_ERROR_UNRECOGNIZED, MESSAGE_UNRECOGNIZED
    }
    private enum Shape { ABSENT, NULL, OBJECT, ARRAY, TEXT, BOOLEAN, NUMBER, OTHER }
}
