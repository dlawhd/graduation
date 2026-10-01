package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import com.fasterxml.jackson.databind.ObjectMapper;
import shop.esjh.memoryjar.dto.ai.response.JarDesignDraftDetailResponse;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationRealtimeEventResponse;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Docker 없이 오류 enum과 V37 허용 목록의 누락을 잡는다. 실제 SQL 실행 검증을 대신하지는 않는다. */
class AiGenerationFailureContractTest {
    @ParameterizedTest
    @EnumSource(JarAiGenerationErrorCode.class)
    void restAndRealtimeReturnOnlyStableFailureCodes(JarAiGenerationErrorCode code) throws Exception {
        var mapper = new ObjectMapper();
        var rest = mapper.readTree(mapper.writeValueAsString(new JarDesignDraftDetailResponse.GenerationItem(
                7L, JarAiStyle.PIXEL, JarAiGenerationStatus.FAILED, code, null)));
        var event = mapper.readTree(mapper.writeValueAsString(new JarAiGenerationRealtimeEventResponse(
                1L, 7L, JarAiStyle.PIXEL, JarAiGenerationStatus.FAILED, code)));
        for (var payload : new com.fasterxml.jackson.databind.JsonNode[]{rest, event}) {
            assertThat(payload.path("errorCode").asText()).isEqualTo(code.name());
            assertThat(payload.path("status").asText()).isEqualTo("FAILED");
            assertThat(payload.size()).isEqualTo(5);
            assertThat(payload.has("errorMessage")).isFalse();
            assertThat(payload.has("providerMessage")).isFalse();
        }
    }

    @Test
    void migrationAllowsExactlyTheGenerationErrorEnum() throws Exception {
        try (var stream = getClass().getResourceAsStream("/db/migration/V37__extend_ai_generation_failure_codes.sql")) {
            assertThat(stream).isNotNull();
            String sql = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            var list = Pattern.compile("error_code IN \\((.*?)\\)", Pattern.DOTALL).matcher(sql);
            assertThat(list.find()).isTrue();
            var codes = Pattern.compile("'([A-Z0-9_]+)'").matcher(list.group(1)).results()
                    .map(match -> match.group(1)).toList();
            assertThat(codes).containsExactlyInAnyOrderElementsOf(Arrays.stream(JarAiGenerationErrorCode.values())
                    .map(Enum::name).toList());
            assertThat(codes).allMatch(code -> code.length() <= 50);
        }
    }
}
