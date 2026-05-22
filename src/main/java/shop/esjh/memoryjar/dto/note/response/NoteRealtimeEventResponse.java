package shop.esjh.memoryjar.dto.note.response;

import shop.esjh.memoryjar.enums.note.NoteRealtimeEventType;

import java.time.OffsetDateTime;
import java.time.ZoneId;

/*
 * NoteRealtimeEventResponse 역할
 *
 * 이 DTO는 WebSocket으로 프론트에게 보내는 "쪽지 상세 변화 알림지"
 *
 * 쉽게 말하면:
 * - 몇 번 저금통에서
 * - 몇 번 쪽지에
 * - 어떤 일이 일어났는지
 * - 누가 그 일을 했는지
 * 알려주는 종이야.
 *
 * 주의:
 * 리액션 summary는 여기서 직접 보내지 않는다.
 * myReaction은 사용자마다 다르기 때문에,
 * 프론트가 이벤트를 받은 뒤 자기 기준으로 GET /reactions를 다시 조회하는 게 안전하다.
 */
public record NoteRealtimeEventResponse(
        Long jarId,
        Long noteId,
        NoteRealtimeEventType type,
        Long actorUserId,
        String actorName,
        Long commentId,
        Long parentCommentId,
        OffsetDateTime occurredAt
) {
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    // 일반 댓글이 새로 작성됐을 때 사용할 응답
    public static NoteRealtimeEventResponse commentCreated(
            Long jarId,
            Long noteId,
            Long actorUserId,
            String actorName,
            Long commentId
    ) {
        return new NoteRealtimeEventResponse(
                jarId,
                noteId,
                NoteRealtimeEventType.COMMENT_CREATED,
                actorUserId,
                actorName,
                commentId,
                null,
                OffsetDateTime.now(KST)
        );
    }

    // 답글이 새로 작성됐을 때 사용할 응답
    public static NoteRealtimeEventResponse commentReplied(
            Long jarId,
            Long noteId,
            Long actorUserId,
            String actorName,
            Long commentId,
            Long parentCommentId
    ) {
        return new NoteRealtimeEventResponse(
                jarId,
                noteId,
                NoteRealtimeEventType.COMMENT_REPLIED,
                actorUserId,
                actorName,
                commentId,
                parentCommentId,
                OffsetDateTime.now(KST)
        );
    }

    // 댓글이 수정됐을 때 사용할 응답
    public static NoteRealtimeEventResponse commentUpdated(
            Long jarId,
            Long noteId,
            Long actorUserId,
            String actorName,
            Long commentId,
            Long parentCommentId
    ) {
        return new NoteRealtimeEventResponse(
                jarId,
                noteId,
                NoteRealtimeEventType.COMMENT_UPDATED,
                actorUserId,
                actorName,
                commentId,
                parentCommentId,
                OffsetDateTime.now(KST)
        );
    }

    // 댓글이 삭제됐을 때 사용할 응답
    public static NoteRealtimeEventResponse commentDeleted(
            Long jarId,
            Long noteId,
            Long actorUserId,
            String actorName,
            Long commentId,
            Long parentCommentId
    ) {
        return new NoteRealtimeEventResponse(
                jarId,
                noteId,
                NoteRealtimeEventType.COMMENT_DELETED,
                actorUserId,
                actorName,
                commentId,
                parentCommentId,
                OffsetDateTime.now(KST)
        );
    }

    // 리액션이 바뀌었을 때 사용할 응답
    public static NoteRealtimeEventResponse reactionChanged(
            Long jarId,
            Long noteId,
            Long actorUserId,
            String actorName
    ) {
        return new NoteRealtimeEventResponse(
                jarId,
                noteId,
                NoteRealtimeEventType.REACTION_CHANGED,
                actorUserId,
                actorName,
                null,
                null,
                OffsetDateTime.now(KST)
        );
    }
}