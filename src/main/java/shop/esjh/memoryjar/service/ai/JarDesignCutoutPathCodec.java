package shop.esjh.memoryjar.service.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.dto.ai.JarDesignCutoutPoint;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;

import java.util.List;

/**
 * Draft DB의 JSON 외곽선과 API용 점 목록을 안전하게 변환한다.
 * S3 Key처럼 민감한 값은 이 JSON에 포함하지 않고 좌표만 저장한다.
 */
@Component
public class JarDesignCutoutPathCodec {

    private static final TypeReference<List<JarDesignCutoutPoint>> POINTS_TYPE = new TypeReference<>() { };
    private static final TypeReference<List<List<JarDesignCutoutPoint>>> REGIONS_TYPE = new TypeReference<>() { };

    private final ObjectMapper objectMapper;

    public JarDesignCutoutPathCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String encode(List<JarDesignCutoutPoint> points) {
        return encodeRegions(points == null || points.isEmpty() ? List.of() : List.of(points));
    }

    /** 여러 닫힌 영역을 중첩 배열 JSON으로 저장한다. */
    public String encodeRegions(List<List<JarDesignCutoutPoint>> regions) {
        try {
            return objectMapper.writeValueAsString(regions);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("배경 제거 외곽선을 저장할 수 없습니다.", exception);
        }
    }

    public List<JarDesignCutoutPoint> decode(String pointsJson) {
        List<List<JarDesignCutoutPoint>> regions = decodeRegions(pointsJson);
        return regions.isEmpty() ? List.of() : regions.get(0);
    }

    /** 기존 단일 배열 JSON과 새 중첩 배열 JSON을 모두 읽어 기존 Draft를 깨지 않는다. */
    public List<List<JarDesignCutoutPoint>> decodeRegions(String pointsJson) {
        if (pointsJson == null || pointsJson.isBlank()) {
            return List.of();
        }

        try {
            JsonNode root = objectMapper.readTree(pointsJson);
            if (!root.isArray() || root.isEmpty()) {
                throw new ApiException(AiDraftErrorCode.DRAFT_CUTOUT_INVALID);
            }
            List<List<JarDesignCutoutPoint>> regions;
            if (root.get(0).isArray()) {
                regions = objectMapper.convertValue(root, REGIONS_TYPE);
            } else {
                List<JarDesignCutoutPoint> legacyPoints = objectMapper.convertValue(root, POINTS_TYPE);
                regions = List.of(legacyPoints);
            }
            JarDesignCutoutGeometry.validateRegions(regions);
            return regions.stream().map(List::copyOf).toList();
        } catch (JsonProcessingException | IllegalArgumentException | ApiException exception) {
            throw new ApiException(AiDraftErrorCode.DRAFT_CUTOUT_INVALID);
        }
    }
}
