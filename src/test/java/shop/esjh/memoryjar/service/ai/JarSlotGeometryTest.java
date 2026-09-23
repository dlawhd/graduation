package shop.esjh.memoryjar.service.ai;

import java.math.BigDecimal;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import static org.assertj.core.api.Assertions.*;

/** 실제 슬롯 크기 경계에서 저장·최종화가 같은 좌표를 허용하는지 검증한다. */
class JarSlotGeometryTest {
    @ParameterizedTest
    @CsvSource({"0.06,0.01715,0", "0.94,0.98285,0", "0.14,0.04,1", "0.86,0.96,1", "0.5,0.5,0.5"})
    void acceptsFullyContainedSlot(String x, String y, String ratio) {
        assertThatCode(() -> JarSlotGeometry.validate(new BigDecimal(x), new BigDecimal(y), new BigDecimal(ratio)))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @CsvSource({"0,0.5,0", "1,0.5,0", "0.5,0,0", "0.5,1,0", "0.13999,0.5,1", "0.86001,0.5,1",
            "0.5,0.03999,1", "0.5,0.96001,1", "0.5,0.01714,0"})
    void rejectsPartiallyOutsideSlot(String x, String y, String ratio) {
        assertThatThrownBy(() -> JarSlotGeometry.validate(new BigDecimal(x), new BigDecimal(y), new BigDecimal(ratio)))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode()).isEqualTo(AiDraftErrorCode.DRAFT_SLOT_OUT_OF_BOUNDS);
    }

    @ParameterizedTest
    @CsvSource(value = {"NULL,0.5,0.5", "0.5,NULL,0.5", "0.5,0.5,NULL", "-0.1,0.5,0.5", "0.5,1.1,0.5", "0.5,0.5,1.1", "0.500001,0.5,0.5"}, nullValues = "NULL")
    void rejectsInvalidScalar(String x, String y, String ratio) {
        assertThatThrownBy(() -> JarSlotGeometry.validate(decimal(x), decimal(y), decimal(ratio)))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode()).isEqualTo(AiDraftErrorCode.DRAFT_SLOT_INVALID);
    }

    private BigDecimal decimal(String value) { return value == null ? null : new BigDecimal(value); }
}
