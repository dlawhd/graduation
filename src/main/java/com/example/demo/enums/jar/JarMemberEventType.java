package com.example.demo.enums.jar;

// "저금통 멤버에게 어떤 변화가 생겼는지"를 표현하는 종류표
public enum JarMemberEventType {

    // 새 멤버가 저금통에 들어왔을 때
    MEMBER_JOINED,

    // 기존 멤버가 직접 저금통을 나갔을 때
    MEMBER_LEFT,

    // 관리자가 멤버를 저금통에서 내보냈을 때
    MEMBER_KICKED,

    // 멤버 역할이 ADMIN 또는 MEMBER로 바뀌었을 때
    MEMBER_ROLE_CHANGED
}