package shop.esjh.memoryjar.service.ai;

import org.springframework.stereotype.Component;

import java.util.UUID;

/** 최종 JarDesign 이미지가 임시 원본·후보와 절대 섞이지 않도록 영구 S3 Key를 만든다. */
@Component
public class JarDesignFinalS3KeyFactory {

    /** 하나의 최종화 시도에만 속하는 UUID Key를 만들어 보상 삭제의 범위를 안전하게 제한한다. */
    public String createKey(Long ownerId, Long draftId) {
        if (!isPositive(ownerId) || !isPositive(draftId)) {
            throw new IllegalArgumentException("최종 디자인 S3 Key에 필요한 식별자가 올바르지 않습니다.");
        }
        return "jar-designs/finals/" + ownerId + "/" + draftId + "/" + UUID.randomUUID() + ".png";
    }

    private boolean isPositive(Long value) {
        return value != null && value > 0;
    }
}
