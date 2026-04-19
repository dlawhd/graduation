package com.example.demo.enums.chat;

public enum ChatMessageType {

    TEXT,   // 사용자가 직접 입력해서 보낸 일반 채팅
    SYSTEM; // "xx님이 입장했어요" 같은 시스템 안내 메시지

    public boolean isText() {
        return this == TEXT;
    }

    public boolean isSystem() {
        return this == SYSTEM;
    }
}