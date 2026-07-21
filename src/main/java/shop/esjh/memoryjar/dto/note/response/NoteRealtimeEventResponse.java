package shop.esjh.memoryjar.dto.note.response;

import shop.esjh.memoryjar.enums.note.NoteRealtimeEventType;

import java.time.OffsetDateTime;
import java.time.ZoneId;

/*
 * NoteRealtimeEventResponse 역할
 *
 * WebSocket으로 프론트에게 보내는
 * "쪽지 변화 알림지"다.
 *
 * 쉽게 말하면:
 * - 몇 번 저금통에서
 * - 몇 번 쪽지에
 * - 어떤 변화가 생겼고
 * - 댓글 개수가 몇 개가 되었는지
 * 알려준다.
 *
 * 주의:
 * 리액션 전체 개수는 기존처럼 REST로 다시 조회한다.
 *
 * 이유:
 * myReaction은 로그인한 사용자마다 다르기 때문에
 * 각 사용자의 인증 정보를 기준으로 조회하는 것이 안전하다.
 */
public record NoteRealtimeEventResponse(
        Long jarId,
        Long noteId,
        NoteRealtimeEventType type,
        Long actorUserId,
        String actorName,
        Long commentId,
        Long parentCommentId,

        // 댓글 작성·답글·삭제 후의 최신 댓글 총개수
        // 댓글 수정과 리액션 이벤트에서는 null
        Long commentCount,

        OffsetDateTime occurredAt
) {
    private static final ZoneId KST =
            ZoneId.of("Asia/Seoul");

    /*
     * 일반 댓글이 새로 작성됐을 때 사용하는 이벤트
     */
    public static NoteRealtimeEventResponse commentCreated(
            Long jarId,
            Long noteId,
            Long actorUserId,
            String actorName,
            Long commentId,
            long commentCount
    ) {
        return new NoteRealtimeEventResponse(
                jarId,
                noteId,
                NoteRealtimeEventType.COMMENT_CREATED,
                actorUserId,
                actorName,
                commentId,
                null,
                commentCount,
                OffsetDateTime.now(KST)
        );
    }

    /*
     * 답글이 새로 작성됐을 때 사용하는 이벤트
     */
    public static NoteRealtimeEventResponse commentReplied(
            Long jarId,
            Long noteId,
            Long actorUserId,
            String actorName,
            Long commentId,
            Long parentCommentId,
            long commentCount
    ) {
        return new NoteRealtimeEventResponse(
                jarId,
                noteId,
                NoteRealtimeEventType.COMMENT_REPLIED,
                actorUserId,
                actorName,
                commentId,
                parentCommentId,
                commentCount,
                OffsetDateTime.now(KST)
        );
    }

    /*
     * 댓글 내용이 수정됐을 때 사용하는 이벤트
     *
     * 댓글 수정은 개수가 달라지지 않으므로
     * commentCount에는 null을 넣는다.
     */
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
                null,
                OffsetDateTime.now(KST)
        );
    }

    /*
     * 댓글이 삭제됐을 때 사용하는 이벤트
     */
    public static NoteRealtimeEventResponse commentDeleted(
            Long jarId,
            Long noteId,
            Long actorUserId,
            String actorName,
            Long commentId,
            Long parentCommentId,
            long commentCount
    ) {
        return new NoteRealtimeEventResponse(
                jarId,
                noteId,
                NoteRealtimeEventType.COMMENT_DELETED,
                actorUserId,
                actorName,
                commentId,
                parentCommentId,
                commentCount,
                OffsetDateTime.now(KST)
        );
    }

    /*
     * 리액션이 추가·변경·취소됐을 때 사용하는 이벤트
     */
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
                null,
                OffsetDateTime.now(KST)
        );
    }
}