package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI 디자인 Draft 원본 업로드의 고정된 보안·보관 정책을 설정에서 읽는다.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.ai-draft")
public class AiDraftProperties {

    // Canvas 또는 외부 원본은 서버에서도 최대 10MB까지만 허용한다.
    private long maxOriginalImageSize = 10L * 1024 * 1024;

    // 압축된 파일 크기가 작아도 과도하게 큰 이미지를 디코딩하는 공격을 막는다.
    private int maxOriginalImageDimension = 4096;

    // 가로·세로 제한과 별도로 총 픽셀 수도 제한한다.
    private long maxOriginalImagePixels = 16L * 1024 * 1024;

    // 새 Draft는 생성 시점부터 7일 동안만 수정과 AI 생성을 허용한다.
    private int expiresAfterDays = 7;

    // 이 신뢰도 이상인 Rekognition 부적절 콘텐츠 라벨이 하나라도 있으면 업로드를 거절한다.
    private float moderationMinConfidence = 80.0F;
}
