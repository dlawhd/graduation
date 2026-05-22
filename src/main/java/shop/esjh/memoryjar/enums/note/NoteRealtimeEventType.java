package shop.esjh.memoryjar.enums.note;

//  "쪽지 상세 화면에서 실시간으로 알려줄 사건 종류"를 정리하는 표
public enum NoteRealtimeEventType {

    // 일반 댓글이 새로 작성됨
    COMMENT_CREATED,

    // 댓글 아래 답글이 새로 작성됨
    COMMENT_REPLIED,

    // 댓글 내용이 수정됨
    COMMENT_UPDATED,

    // 댓글이 삭제됨
    COMMENT_DELETED,

    // 리액션 개수 또는 내 리액션 상태가 바뀔 수 있음
    REACTION_CHANGED
}