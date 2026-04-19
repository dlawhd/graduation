package com.example.demo.entity.chat;

import com.example.demo.entity.BaseEntity;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.enums.chat.ChatMessageType;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

/*
 * 이 엔티티가 저장하는 것
 * - 어느 저금통(jar) 메시지인지
 * - 누가 보냈는지(sender)
 * - 어떤 종류인지(type)
 * - 실제 텍스트 내용(content)
 *
 * 지금 단계 규칙
 * - 텍스트는 필수
 * - 파일은 아직 필수 아님
 * - 그래서 content는 항상 값이 들어가야 함
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "chat_messages")
@SQLDelete(sql = "UPDATE chat_messages SET deleted_at = NOW(), updated_at = NOW() WHERE message_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ChatMessage extends BaseEntity {

    // 메시지 하나마다 붙는 고유 번호표
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "message_id")
    private Long messageId;

    // 어느 저금통 채팅 메시지인지 저장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "jar_id", nullable = false)
    private Jar jar;

    // 누가 보냈는지 저장
    // SYSTEM 메시지는 sender가 없을 수 있으므로 nullable = true
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id")
    private User sender;

    // 메시지 종류(TEXT / SYSTEM)
    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 30)
    private ChatMessageType type;

    // 실제 채팅 내용
    // 지금 규칙상 텍스트는 필수이므로 null 불가
    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    /*
     * Builder 생성자
     * - 밖에서 new ChatMessage(...) 직접 만들지 않고
     * - builder 또는 static 생성 메서드로 읽기 쉽게 만들려고 사용
     */
    @Builder
    private ChatMessage(
            Jar jar,
            User sender,
            ChatMessageType type,
            String content
    ) {
        this.jar = jar;
        this.sender = sender;
        this.type = type;
        this.content = content;
    }

    /*
     * 일반 텍스트 채팅 생성

     * 예:
     * ChatMessage.createText(jar, loginUser, "안녕!");
     */
    public static ChatMessage createText(Jar jar, User sender, String content) {
        return ChatMessage.builder()
                .jar(jar)
                .sender(sender)
                .type(ChatMessageType.TEXT)
                .content(content)
                .build();
    }

    /*
     * 시스템 메시지 생성

     * 예:
     * ChatMessage.createSystem(jar, "xx님이 입장했어요.");
     */
    public static ChatMessage createSystem(Jar jar, String content) {
        return ChatMessage.builder()
                .jar(jar)
                .sender(null)
                .type(ChatMessageType.SYSTEM)
                .content(content)
                .build();
    }

    /*
     * 이 메시지가 특정 저금통의 메시지인지 확인

     * 왜 필요하냐면?
     * - 서비스에서 "이 메시지가 진짜 이 jarId 소속이 맞나?"
     *   안전하게 한 번 더 확인할 때 읽기 좋게 쓰려고 만든 메서드
     */
    public boolean isJar(Long jarId) {
        return jar != null && jar.getJarId().equals(jarId);
    }

    /*
     * 이 메시지를 특정 사용자가 보낸 게 맞는지 확인

     * SYSTEM 메시지는 sender가 없으므로 false가 나올 수 있음
     */
    public boolean isSender(Long userId) {
        return sender != null && sender.getId().equals(userId);
    }

    /*
     * 시스템 메시지인지 확인
     */
    public boolean isSystemMessage() {
        return this.type == ChatMessageType.SYSTEM;
    }

    /*
     * 일반 텍스트 메시지인지 확인
     */
    public boolean isTextMessage() {
        return this.type == ChatMessageType.TEXT;
    }
}