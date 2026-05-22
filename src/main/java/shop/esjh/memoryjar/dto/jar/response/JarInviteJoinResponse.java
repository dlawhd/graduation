package shop.esjh.memoryjar.dto.jar.response;

import shop.esjh.memoryjar.enums.jar.JarRole;

import java.time.OffsetDateTime;

// 초대코드로 참여가 성공했을 때 이 저금통에 잘 들어왔고, 네 역할은 xx야!
public record JarInviteJoinResponse(
        Long jarId,
        String name,
        JarRole myRole,
        OffsetDateTime joinedAt
) {
}