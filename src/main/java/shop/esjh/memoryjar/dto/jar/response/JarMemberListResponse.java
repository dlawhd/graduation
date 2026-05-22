package shop.esjh.memoryjar.dto.jar.response;

import java.util.List;

// 저금통 멤버 목록 전체를 담는
public record JarMemberListResponse(
        List<JarMemberItem> items
) {
}