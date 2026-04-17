package com.example.demo.repository.notification;

import com.example.demo.config.JpaAuditConfig;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.notification.Notification;
import com.example.demo.enums.notification.NotificationType;
import com.example.demo.model.notification.NotificationPayload;
import com.example.demo.repository.support.AbstractMariaDbRepositoryTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class NotificationRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private NotificationRepository notificationRepository;

    @Test
    @DisplayName("findByUser_IdAndDeletedAtIsNull은 현재 사용자의 삭제되지 않은 알림만 조회한다")
    void findByUserIdAndDeletedAtIsNull_returnsOnlyActiveNotificationsForUser() {
        User user = saveUser("notification-list-user", "notification-list-user@example.com", "user");
        User otherUser = saveUser("notification-list-other", "notification-list-other@example.com", "other");
        Jar jar = saveJar(user, "notification-list-jar", LocalDateTime.now().plusDays(1));

        Notification olderNotification = saveNotification(
                user,
                jar,
                NotificationType.NOTE_COMMENTED,
                payload(jar.getJarId(), 1L, 10L, otherUser, null)
        );
        Notification newerNotification = saveNotification(
                user,
                jar,
                NotificationType.NOTE_REACTED,
                payload(jar.getJarId(), 2L, null, otherUser, "LOVE")
        );
        saveNotification(otherUser, jar, NotificationType.JAR_MEMBER_JOINED,
                payload(jar.getJarId(), null, null, user, null));

        Notification deletedNotification = saveNotification(
                user,
                jar,
                NotificationType.COMMENT_REPLIED,
                payload(jar.getJarId(), 3L, 30L, otherUser, null)
        );
        notificationRepository.delete(deletedNotification);

        flushAndClear();

        Page<Notification> result = notificationRepository.findByUser_IdAndDeletedAtIsNull(
                user.getId(),
                PageRequest.of(0, 10, Sort.by(
                        Sort.Order.desc("createdAt"),
                        Sort.Order.desc("notificationId")
                ))
        );

        assertThat(result.getContent())
                .extracting(Notification::getNotificationId)
                .containsExactly(newerNotification.getNotificationId(), olderNotification.getNotificationId());
    }

    @Test
    @DisplayName("countByUser_IdAndIsReadFalseAndDeletedAtIsNull은 읽지 않은 활성 알림만 센다")
    void countUnread_countsOnlyUnreadActiveNotifications() {
        User user = saveUser("notification-count-user", "notification-count-user@example.com", "user");
        User otherUser = saveUser("notification-count-other", "notification-count-other@example.com", "other");
        Jar jar = saveJar(user, "notification-count-jar", LocalDateTime.now().plusDays(1));

        saveNotification(user, jar, NotificationType.NOTE_COMMENTED,
                payload(jar.getJarId(), 1L, 10L, otherUser, null));
        saveNotification(user, jar, NotificationType.NOTE_REACTED,
                payload(jar.getJarId(), 2L, null, otherUser, "SMILE"));

        Notification readNotification = saveNotification(user, jar, NotificationType.COMMENT_REPLIED,
                payload(jar.getJarId(), 3L, 30L, otherUser, null));
        readNotification.markAsRead(LocalDateTime.now());

        Notification deletedNotification = saveNotification(user, jar, NotificationType.JAR_MEMBER_JOINED,
                payload(jar.getJarId(), null, null, otherUser, null));
        notificationRepository.delete(deletedNotification);

        saveNotification(otherUser, jar, NotificationType.NOTE_COMMENTED,
                payload(jar.getJarId(), 4L, 40L, user, null));

        flushAndClear();

        assertThat(notificationRepository.countByUser_IdAndIsReadFalseAndDeletedAtIsNull(user.getId()))
                .isEqualTo(2);
    }

    @Test
    @DisplayName("findByNotificationIdAndUser_IdAndDeletedAtIsNull은 알림 소유자가 맞는 경우만 조회한다")
    void findByNotificationIdAndUserId_returnsOnlyOwnedActiveNotification() {
        User user = saveUser("notification-find-user", "notification-find-user@example.com", "user");
        User otherUser = saveUser("notification-find-other", "notification-find-other@example.com", "other");
        Jar jar = saveJar(user, "notification-find-jar", LocalDateTime.now().plusDays(1));

        Notification notification = saveNotification(user, jar, NotificationType.NOTE_COMMENTED,
                payload(jar.getJarId(), 1L, 10L, otherUser, null));

        flushAndClear();

        assertThat(notificationRepository.findByNotificationIdAndUser_IdAndDeletedAtIsNull(
                notification.getNotificationId(),
                user.getId()
        )).isPresent();
        assertThat(notificationRepository.findByNotificationIdAndUser_IdAndDeletedAtIsNull(
                notification.getNotificationId(),
                otherUser.getId()
        )).isEmpty();
    }

    @Test
    @DisplayName("findByNotificationIdAndUser_IdAndDeletedAtIsNull은 soft delete 된 알림을 제외한다")
    void findByNotificationIdAndUserId_excludesSoftDeletedNotification() {
        User user = saveUser("notification-delete-user", "notification-delete-user@example.com", "user");
        User actor = saveUser("notification-delete-actor", "notification-delete-actor@example.com", "actor");
        Jar jar = saveJar(user, "notification-delete-jar", LocalDateTime.now().plusDays(1));

        Notification notification = saveNotification(user, jar, NotificationType.NOTE_COMMENTED,
                payload(jar.getJarId(), 1L, 10L, actor, null));
        notificationRepository.delete(notification);

        flushAndClear();

        assertThat(notificationRepository.findByNotificationIdAndUser_IdAndDeletedAtIsNull(
                notification.getNotificationId(),
                user.getId()
        )).isEmpty();
    }

    @Test
    @DisplayName("markAllAsRead는 현재 사용자의 읽지 않은 활성 알림만 읽음 처리한다")
    void markAllAsRead_marksOnlyCurrentUsersUnreadActiveNotifications() {
        User user = saveUser("notification-read-all-user", "notification-read-all-user@example.com", "user");
        User otherUser = saveUser("notification-read-all-other", "notification-read-all-other@example.com", "other");
        Jar jar = saveJar(user, "notification-read-all-jar", LocalDateTime.now().plusDays(1));

        Notification unreadOne = saveNotification(user, jar, NotificationType.NOTE_COMMENTED,
                payload(jar.getJarId(), 1L, 10L, otherUser, null));
        Notification unreadTwo = saveNotification(user, jar, NotificationType.NOTE_REACTED,
                payload(jar.getJarId(), 2L, null, otherUser, "CHEER"));

        LocalDateTime oldReadAt = LocalDateTime.of(2026, 4, 16, 12, 30);
        Notification alreadyRead = saveNotification(user, jar, NotificationType.COMMENT_REPLIED,
                payload(jar.getJarId(), 3L, 30L, otherUser, null));
        alreadyRead.markAsRead(oldReadAt);

        Notification deletedNotification = saveNotification(user, jar, NotificationType.JAR_MEMBER_JOINED,
                payload(jar.getJarId(), null, null, otherUser, null));
        notificationRepository.delete(deletedNotification);

        Notification otherUsersNotification = saveNotification(otherUser, jar, NotificationType.NOTE_COMMENTED,
                payload(jar.getJarId(), 4L, 40L, user, null));

        LocalDateTime now = LocalDateTime.of(2026, 4, 17, 12, 30);

        int updatedCount = notificationRepository.markAllAsRead(user.getId(), now);
        flushAndClear();

        assertThat(updatedCount).isEqualTo(2);

        Notification updatedOne = notificationRepository.findById(unreadOne.getNotificationId()).orElseThrow();
        Notification updatedTwo = notificationRepository.findById(unreadTwo.getNotificationId()).orElseThrow();
        Notification unchangedRead = notificationRepository.findById(alreadyRead.getNotificationId()).orElseThrow();
        Notification unchangedOtherUser = notificationRepository.findById(otherUsersNotification.getNotificationId()).orElseThrow();

        assertThat(updatedOne.isRead()).isTrue();
        assertThat(updatedOne.getReadAt()).isEqualTo(now);
        assertThat(updatedTwo.isRead()).isTrue();
        assertThat(updatedTwo.getReadAt()).isEqualTo(now);

        assertThat(unchangedRead.isRead()).isTrue();
        assertThat(unchangedRead.getReadAt()).isEqualTo(oldReadAt);
        assertThat(unchangedOtherUser.isRead()).isFalse();
        assertThat(unchangedOtherUser.getReadAt()).isNull();
    }

    private Notification saveNotification(
            User user,
            Jar jar,
            NotificationType type,
            NotificationPayload payload
    ) {
        return persist(Notification.create(user, jar, type, payload));
    }

    private NotificationPayload payload(
            Long jarId,
            Long noteId,
            Long commentId,
            User actor,
            String emoji
    ) {
        return new NotificationPayload(
                jarId,
                noteId,
                commentId,
                actor.getId(),
                actor.getName(),
                emoji
        );
    }
}
