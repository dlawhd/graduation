package shop.esjh.memoryjar.dto.ai.response;

import java.time.OffsetDateTime;
import java.util.List;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;

/** 본인이 이어 만들 수 있는 디자인의 최소 정보만 담는다. */
public record JarDesignDraftListResponse(List<Item> items, int page, boolean hasNext) {
    public record Item(Long draftId, JarBodyStyle bodyStyle, JarDraftDesignType selectedDesignType,
            OffsetDateTime updatedAt, OffsetDateTime expiresAt) {}
}
