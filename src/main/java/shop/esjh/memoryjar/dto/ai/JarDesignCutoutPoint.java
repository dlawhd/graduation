package shop.esjh.memoryjar.dto.ai;

import java.math.BigDecimal;

/**
 * 커스텀 저금통 외곽선을 이미지 가로·세로 비율(0~1)로 저장하는 한 점이다.
 * 실제 픽셀 크기가 달라도 같은 외곽선을 다시 적용할 수 있게 정규화 좌표를 사용한다.
 */
public record JarDesignCutoutPoint(BigDecimal x, BigDecimal y) {
}
