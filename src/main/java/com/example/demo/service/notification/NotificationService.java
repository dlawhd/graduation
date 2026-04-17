package com.example.demo.service.notification;

import com.example.demo.dto.notification.response.NotificationItemResponse;
import com.example.demo.dto.notification.response.NotificationListResponse;
import com.example.demo.dto.notification.response.NotificationReadAllResponse;
import com.example.demo.dto.notification.response.NotificationReadResponse;
import com.example.demo.dto.notification.response.NotificationUnreadCountResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.notification.Notification;
import com.example.demo.enums.notification.NotificationType;
import com.example.demo.model.notification.NotificationPayload;
import com.example.demo.repository.notification.NotificationRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class NotificationService {

    private final NotificationRepository notificationRepository;

    public NotificationService(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    public NotificationListResponse getMyNotifications(Long currentUserId, int page, int size) {
        PageRequest pageRequest = PageRequest.of(
                page,
                size,
                Sort.by(
                        Sort.Order.desc("createdAt"),
                        Sort.Order.desc("notificationId")
                )
        );

        Page<Notification> notificationPage =
                notificationRepository.findByUser_IdAndDeletedAtIsNull(currentUserId, pageRequest);

        List<NotificationItemResponse> items = notificationPage.getContent()
                .stream()
                .map(this::toNotificationItemResponse)
                .toList();

        return new NotificationListResponse(
                items,
                notificationPage.getNumber(),
                notificationPage.getSize(),
                notificationPage.getTotalElements(),
                notificationPage.getTotalPages()
        );
    }

    public NotificationUnreadCountResponse getUnreadCount(Long currentUserId) {
        long unreadCount = notificationRepository.countByUser_IdAndIsReadFalseAndDeletedAtIsNull(currentUserId);
        return new NotificationUnreadCountResponse(unreadCount);
    }

    @Transactional
    public NotificationReadResponse markAsRead(Long currentUserId, Long notificationId) {
        Notification notification = notificationRepository
                .findByNotificationIdAndUser_IdAndDeletedAtIsNull(notificationId, currentUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "알림을 찾을 수 없어요."));

        LocalDateTime now = LocalDateTime.now();
        notification.markAsRead(now);

        return new NotificationReadResponse(
                notification.getNotificationId(),
                notification.isRead(),
                notification.getReadAt()
        );
    }

    @Transactional
    public NotificationReadAllResponse markAllAsRead(Long currentUserId) {
        LocalDateTime now = LocalDateTime.now();
        int updatedCount = notificationRepository.markAllAsRead(currentUserId, now);

        return new NotificationReadAllResponse(updatedCount, now);
    }

    @Transactional
    public void notifyNoteCommented(User receiver, Jar jar, NotificationPayload payload) {
        createNotificationIfNeeded(receiver, jar, NotificationType.NOTE_COMMENTED, payload);
    }

    @Transactional
    public void notifyCommentReplied(Collection<User> candidateReceivers, Jar jar, NotificationPayload payload) {
        createNotificationsForMany(candidateReceivers, jar, NotificationType.COMMENT_REPLIED, payload);
    }

    @Transactional
    public void notifyNoteReacted(User receiver, Jar jar, NotificationPayload payload) {
        createNotificationIfNeeded(receiver, jar, NotificationType.NOTE_REACTED, payload);
    }

    @Transactional
    public void notifyJarMemberJoined(Collection<User> candidateReceivers, Jar jar, NotificationPayload payload) {
        createNotificationsForMany(candidateReceivers, jar, NotificationType.JAR_MEMBER_JOINED, payload);
    }

    private void createNotificationIfNeeded(User receiver,
                                            Jar jar,
                                            NotificationType type,
                                            NotificationPayload payload) {
        if (receiver == null || payload == null) {
            return;
        }

        Long receiverId = receiver.getId();
        Long actorUserId = payload.actorUserId();

        if (receiverId == null) {
            return;
        }

        if (actorUserId != null && receiverId.equals(actorUserId)) {
            return;
        }

        Notification notification = Notification.create(receiver, jar, type, payload);
        notificationRepository.save(notification);
    }

    private void createNotificationsForMany(Collection<User> candidateReceivers,
                                            Jar jar,
                                            NotificationType type,
                                            NotificationPayload payload) {
        if (candidateReceivers == null || candidateReceivers.isEmpty() || payload == null) {
            return;
        }

        Set<Long> processedReceiverIds = new HashSet<>();

        for (User receiver : candidateReceivers) {
            if (receiver == null || receiver.getId() == null) {
                continue;
            }

            if (!processedReceiverIds.add(receiver.getId())) {
                continue;
            }

            createNotificationIfNeeded(receiver, jar, type, payload);
        }
    }

    private NotificationItemResponse toNotificationItemResponse(Notification notification) {
        NotificationPayload payload = notification.getPayload();

        Long jarId = payload != null ? payload.jarId() : null;
        Long noteId = payload != null ? payload.noteId() : null;
        Long commentId = payload != null ? payload.commentId() : null;
        Long actorUserId = payload != null ? payload.actorUserId() : null;
        String actorName = payload != null ? payload.actorName() : null;
        String emoji = payload != null ? payload.emoji() : null;

        return new NotificationItemResponse(
                notification.getNotificationId(),
                notification.getType(),
                buildMessage(notification.getType(), actorName, emoji),
                notification.isRead(),
                notification.getReadAt(),
                notification.getCreatedAt(),
                jarId,
                noteId,
                commentId,
                actorUserId,
                actorName,
                emoji
        );
    }

    private String buildMessage(NotificationType type, String actorName, String emoji) {
        String safeActorName = (actorName == null || actorName.isBlank()) ? "알 수 없는 사용자" : actorName;

        return switch (type) {
            case NOTE_COMMENTED -> safeActorName + "님이 내 쪽지에 댓글을 남겼어요.";
            case COMMENT_REPLIED -> safeActorName + "님이 내 댓글에 답글을 남겼어요.";
            case NOTE_REACTED -> safeActorName + "님이 내 쪽지에 "
                    + (emoji == null || emoji.isBlank() ? "" : emoji + " ")
                    + "리액션을 남겼어요.";
            case JAR_MEMBER_JOINED -> safeActorName + "님이 저금통에 참여했어요.";
        };
    }
}
