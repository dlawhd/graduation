package shop.esjh.memoryjar.entity.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;

/** 정사각형 원본에서 사진 창에 표시할 사각형을 저장하는 불변 값이다. 별도 테이블/조회는 만들지 않는다. */
@Getter
@Embeddable
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JarPhotoFrame {
    @Column(name = "photo_x", precision = 7, scale = 6)
    private BigDecimal x;
    @Column(name = "photo_y", precision = 7, scale = 6)
    private BigDecimal y;
    @Column(name = "photo_width", precision = 7, scale = 6)
    private BigDecimal width;
    @Column(name = "photo_height", precision = 7, scale = 6)
    private BigDecimal height;

    public JarPhotoFrame(JarPhotoFrameValue value) {
        this.x = value.x(); this.y = value.y();
        this.width = value.width(); this.height = value.height();
    }

    /** Entity 자체가 아닌 읽기 전용 DTO 값으로 내보낸다. */
    public JarPhotoFrameValue toValue() { return new JarPhotoFrameValue(x, y, width, height); }
    public static JarPhotoFrameValue valueOf(JarPhotoFrame frame) { return frame == null ? null : frame.toValue(); }
}
