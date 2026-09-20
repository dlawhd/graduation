package shop.esjh.memoryjar.service.ai;

import org.springframework.stereotype.Component;

/**
 * AI Draft 임시 후보의 서버 전용 S3 Key를 한 규칙으로 만든다.
 * Generation ID를 사용하므로 DB 기록 전 프로세스가 종료돼도 stale 정리 작업이 경로를 재구성할 수 있다.
 */
@Component
public class AiDraftS3KeyFactory {

    /** 한 Generation이 만들 수 있는 후보 PNG의 유일하고 변경되지 않는 임시 경로다. */
    public String candidateKey(Long ownerId, Long draftId, Long generationId) {
        if (!isPositive(ownerId) || !isPositive(draftId) || !isPositive(generationId)) {
            throw new IllegalArgumentException("AI 후보 S3 Key에 필요한 식별자가 올바르지 않습니다.");
        }
        return "jar-design-drafts/generations/" + ownerId + "/" + draftId + "/" + generationId + ".png";
    }

    private boolean isPositive(Long value) {
        return value != null && value > 0;
    }
}
