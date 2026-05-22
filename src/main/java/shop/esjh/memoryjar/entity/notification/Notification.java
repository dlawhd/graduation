package shop.esjh.memoryjar.entity.notification;

import shop.esjh.memoryjar.entity.BaseEntity;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.converter.NotificationPayloadJsonConverter;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.notification.NotificationType;
import shop.esjh.memoryjar.model.notification.NotificationPayload;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDateTime;

/*
 * - 누가 알림을 받는지
 * - 어떤 저금통 관련 알림인지
 * - 어떤 종류 알림인지
 * - 알림 클릭 시 어디로 이동해야 하는지
 * - 읽었는지
 * 를 DB에 저장하는 진짜 본체
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "notifications")
@SQLDelete(sql = "UPDATE notifications SET deleted_at = NOW(6) WHERE notification_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Notification extends BaseEntity {

    // 알림 하나마다 붙는 고유 번호표
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "notification_id")
    private Long notificationId;

    /*
     * 이 알림을 받는 사용자
     * 예:
     * - 내 쪽지에 댓글이 달렸다면 "나"가 여기 들어감
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /*
     * 어느 저금통 관련 알림
     * 예:
     * - 댓글 알림
     * - 대댓글 알림
     * - 리액션 알림
     * - 새 멤버 입장 알림
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "jar_id")
    private Jar jar;

    /*
     * 알림 종류 이름표
     * 문자열로 저장해서 DB에서 봐도 의미를 바로 알 수 있게 함
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 50)
    private NotificationType type;

    /*
     * 알림 상세 정보 꾸러미
     * DB에는 JSON 문자열(payload_json)로 저장되고, 자바에서는 NotificationPayload 객체처럼 편하게 사용
     */
    @Convert(converter = NotificationPayloadJsonConverter.class)
    @Column(name = "payload_json", columnDefinition = "LONGTEXT", nullable = false)
    private NotificationPayload payload;

    /*
     * 읽음 여부
     * false면 아직 안 읽은 상태, true면 읽은 상태
     */
    @Column(name = "is_read", nullable = false)
    private boolean isRead;

    /*
     * 실제로 읽은 시간
     * 아직 안 읽었으면 null
     */
    @Column(name = "read_at")
    private LocalDateTime readAt;

    @Builder
    private Notification(User user,
                         Jar jar,
                         NotificationType type,
                         NotificationPayload payload,
                         boolean isRead,
                         LocalDateTime readAt) {
        this.user = user;
        this.jar = jar;
        this.type = type;
        this.payload = payload;
        this.isRead = isRead;
        this.readAt = readAt;
    }

    /*
     * 새 알림을 만들 때 사용하는 편의 메서드
     * 새로 만들어진 알림은 아직 안 읽은 상태여야 하니까 isRead = false, readAt = null 로 시작
     */
    public static Notification create(User user,
                                      Jar jar,
                                      NotificationType type,
                                      NotificationPayload payload) {
        return Notification.builder()
                .user(user)
                .jar(jar)
                .type(type)
                .payload(payload)
                .isRead(false)
                .readAt(null)
                .build();
    }

    /*
     * 알림 1개를 읽음 처리할 때 사용하는 메서드
     */
    public void markAsRead(LocalDateTime now) {
        if (this.isRead) {
            return;
        }

        this.isRead = true;
        this.readAt = now;
    }
}