package com.example.demo.enums.notification;

/*
 * 이 enum은 "알림 종류 이름표" 역할

 * 쉽게 말하면:
 * - 어떤 이유로 알림이 생겼는지 구분하는 표지판
 */
public enum NotificationType {

    // 내 쪽지에 일반 댓글이 달렸을 때
    NOTE_COMMENTED,

    // 내 댓글에 대댓글이 달렸을 때
    COMMENT_REPLIED,

    // 내 쪽지에 리액션이 달렸을 때
    NOTE_REACTED,

    // 내 저금통에 새로운 멤버가 들어왔을 때
    JAR_MEMBER_JOINED
}