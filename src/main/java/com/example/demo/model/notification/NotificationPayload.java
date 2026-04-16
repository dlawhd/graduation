package com.example.demo.model.notification;

/*
 * model 패키지에 둔 이유:
 * NotificationPayload는 JPA Entity가 아니고, request/response DTO도 아닌 알림 내부 전용 값 객체
 * 그래서 알림 기능에서 사용하는 데이터 모양을 모아두는 model 패키지에 두는 게 가장 잘 맞는다.

 * 이 record는 "알림 상세 정보 꾸러미" 역할

 * 쉽게 말하면:
 * - 알림을 눌렀을 때 어디로 이동해야 하는지
 * - 누가 행동했는지
 * - 어떤 이모지였는지

 * 왜 필요하냐면? 알림 종류마다 필요한 정보가 조금씩 다르기 때문
 *
 * 예:
 * 1) NOTE_COMMENTED
 *    - jarId, noteId, commentId, actorUserId, actorName 정도가 필요

 * 2) NOTE_REACTED
 *    - jarId, noteId, actorUserId, actorName, emoji 가 필요

 * 3) JAR_MEMBER_JOINED
 *    - jarId, actorUserId, actorName 정도만 필요

 * 즉,
 * 모든 알림이 똑같은 정보를 쓰는 게 아니라서 이런 "묶음 객체" 하나가 있으면 훨씬 깔끔
 */
public record NotificationPayload(

        // 어떤 저금통으로 이동해야 하는지
        Long jarId,

        // 어떤 쪽지로 이동해야 하는지
        Long noteId,

        // 어떤 댓글을 기준으로 보여줄지
        // 일반 댓글 / 대댓글 알림에서 주로 사용
        Long commentId,

        // 실제 행동한 사람의 사용자 번호
        Long actorUserId,

        // 화면에 보여줄 행동한 사람 이름
        String actorName,

        // 리액션 알림일 때 사용
        // 예: "❤️", "😂"
        String emoji
) {
}