package shop.esjh.memoryjar.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.dto.ai.JarDesignCutoutPoint;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 기존 단일 외곽선과 새 다중 영역 JSON이 함께 유지되는지 검증한다. */
class JarDesignCutoutPathCodecTest {

    private final JarDesignCutoutPathCodec codec = new JarDesignCutoutPathCodec(new ObjectMapper());

    @Test
    void decodeRegions_wrapsLegacySingleRegion() {
        List<List<JarDesignCutoutPoint>> regions = codec.decodeRegions("""
                [{"x":0.1,"y":0.1},{"x":0.9,"y":0.1},{"x":0.5,"y":0.9}]
                """);

        assertThat(regions).hasSize(1);
        assertThat(regions.get(0)).hasSize(3);
    }

    @Test
    void encodeAndDecodeRegions_preservesSeparatedRegions() {
        List<List<JarDesignCutoutPoint>> expected = List.of(
                triangle("0.1"), triangle("0.6"));

        assertThat(codec.decodeRegions(codec.encodeRegions(expected))).isEqualTo(expected);
    }

    private List<JarDesignCutoutPoint> triangle(String offset) {
        BigDecimal x = new BigDecimal(offset);
        return List.of(
                new JarDesignCutoutPoint(x, new BigDecimal("0.1")),
                new JarDesignCutoutPoint(x.add(new BigDecimal("0.2")), new BigDecimal("0.1")),
                new JarDesignCutoutPoint(x.add(new BigDecimal("0.1")), new BigDecimal("0.3")));
    }
}
