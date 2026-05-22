package shop.esjh.memoryjar.entity.chat;

import shop.esjh.memoryjar.entity.BaseEntity;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

/*
 * 쉽게 말하면 책갈피라고 생각
 * - jar = 어느 채팅방인지
 * - user = 누구 책갈피인지
 * - lastReadMessage = 마지막으로 읽은 메시지
 *
 * unread 계산할 때 아주 중요
 * 예:
 * - 마지막으로 읽은 메시지가 10번
 * - 현재 최신 메시지가 15번
 * => 11~15번까지 5개가 unread
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(
        name = "chat_read_state",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uq_chat_read_state_jar_user",
                        columnNames = {"jar_id", "user_id"}
                )
        }
)
@SQLDelete(sql = "UPDATE chat_read_state SET deleted_at = NOW(), updated_at = NOW() WHERE chat_read_state_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ChatReadState extends BaseEntity {

    // 읽음 상태 row 하나마다 붙는 고유 번호표
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "chat_read_state_id")
    private Long chatReadStateId;

    // 어느 저금통 채팅의 읽음 상태인지
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "jar_id", nullable = false)
    private Jar jar;

    // 누구의 읽음 상태인지
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // 마지막으로 읽은 메시지
    // 아직 한 번도 안 읽었으면 null 가능
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "last_read_message_id")
    private ChatMessage lastReadMessage;

    @Builder
    private ChatReadState(
            Jar jar,
            User user,
            ChatMessage lastReadMessage
    ) {
        this.jar = jar;
        this.user = user;
        this.lastReadMessage = lastReadMessage;
    }

    /*
     * 처음 읽음 상태를 만들 때 사용하는 생성 메서드
     * 처음에는 아직 읽은 메시지가 없으니 lastReadMessage = null 로 시작
     */
    public static ChatReadState create(Jar jar, User user) {
        return ChatReadState.builder()
                .jar(jar)
                .user(user)
                .lastReadMessage(null)
                .build();
    }

    /*
     * 마지막 읽은 메시지를 갱신하는 메서드
     *
     * 중요한 규칙
     * - 더 뒤에 있는 메시지일 때만 앞으로 이동
     * - 더 예전 메시지로는 되돌아가지 않음
     *
     * 예:
     * - 현재 lastRead = 20
     * - 새로 들어온 값 = 25 -> 갱신 O
     * - 새로 들어온 값 = 18 -> 갱신 X
     */
    public void markAsRead(ChatMessage message) {
        if (message == null) {
            return;
        }

        if (this.lastReadMessage == null) {
            this.lastReadMessage = message;
            return;
        }

        if (message.getMessageId() > this.lastReadMessage.getMessageId()) {
            this.lastReadMessage = message;
        }
    }

    // 이 읽음 상태가 특정 사용자의 것인지 확인
    public boolean isUser(Long userId) {
        return user != null && user.getId().equals(userId);
    }

    // 이 읽음 상태가 특정 저금통의 것인지 확인
    public boolean isJar(Long jarId) {
        return jar != null && jar.getJarId().equals(jarId);
    }

    // 마지막 읽은 메시지가 있는지 확인
    public boolean hasLastReadMessage() {
        return lastReadMessage != null;
    }

    // 서비스/DTO에서 lastReadMessageId만 꺼내 쓰기 편하게 만든 메서드
    public Long getLastReadMessageId() {
        return lastReadMessage == null ? null : lastReadMessage.getMessageId();
    }
}