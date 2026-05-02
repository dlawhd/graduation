package com.example.demo.dto.jar.response;

import com.example.demo.enums.jar.JarMemberEventType;
import com.example.demo.enums.jar.JarRole;

import java.time.OffsetDateTime;
import java.time.ZoneId;

//  WebSocket으로 프론트에게 보내는 "저금통 멤버 변화 알림지"
public record JarMemberSocketEventResponse(

        Long jarId,

        // MEMBER_JOINED, MEMBER_LEFT, MEMBER_KICKED, MEMBER_ROLE_CHANGED
        JarMemberEventType type,

        // 행동한 사람 id
        Long actorUserId,

        // 행동한 사람 이름
        String actorName,

        // 변화 대상이 된 사람 id
        Long targetUserId,

        // 변화 대상이 된 사람 이름
        String targetUserName,

        // 변화 대상의 역할
        JarRole targetRole,

        // 이벤트가 발생한 시간
        OffsetDateTime occurredAt
) {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    // 새 멤버가 들어왔을 때 보내는 이벤트를 만든다.
    public static JarMemberSocketEventResponse memberJoined(
            Long jarId,
            Long userId,
            String userName,
            JarRole role
    ) {
        return new JarMemberSocketEventResponse(
                jarId,
                JarMemberEventType.MEMBER_JOINED,
                userId,
                userName,
                userId,
                userName,
                role,
                OffsetDateTime.now(KST)
        );
    }

    // 멤버가 직접 나갔을 때 보내는 이벤트를 만든다.
    public static JarMemberSocketEventResponse memberLeft(
            Long jarId,
            Long userId,
            String userName,
            JarRole role
    ) {
        return new JarMemberSocketEventResponse(
                jarId,
                JarMemberEventType.MEMBER_LEFT,
                userId,
                userName,
                userId,
                userName,
                role,
                OffsetDateTime.now(KST)
        );
    }

    // 관리자가 멤버를 강퇴했을 때 보내는 이벤트를 만든다.
    public static JarMemberSocketEventResponse memberKicked(
            Long jarId,
            Long actorUserId,
            String actorName,
            Long targetUserId,
            String targetUserName,
            JarRole targetRole
    ) {
        return new JarMemberSocketEventResponse(
                jarId,
                JarMemberEventType.MEMBER_KICKED,
                actorUserId,
                actorName,
                targetUserId,
                targetUserName,
                targetRole,
                OffsetDateTime.now(KST)
        );
    }

    // 멤버 역할이 바뀌었을 때 보내는 이벤트를 만든다.
    public static JarMemberSocketEventResponse memberRoleChanged(
            Long jarId,
            Long actorUserId,
            String actorName,
            Long targetUserId,
            String targetUserName,
            JarRole targetRole
    ) {
        return new JarMemberSocketEventResponse(
                jarId,
                JarMemberEventType.MEMBER_ROLE_CHANGED,
                actorUserId,
                actorName,
                targetUserId,
                targetUserName,
                targetRole,
                OffsetDateTime.now(KST)
        );
    }
}