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
import java.util.*;

// "알림 보기"와 "알림 만들기"를 둘 다 담당
@Service
@Transactional(readOnly = true)
public class NotificationService {

    private final NotificationRepository notificationRepository;

    public NotificationService(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    // 내 알림 목록을 페이지 형태로 조회하는 메서드
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

    // 안 읽은 알림 개수를 조회하는 메서드
    public NotificationUnreadCountResponse getUnreadCount(Long currentUserId) {
        long unreadCount = notificationRepository.countByUser_IdAndIsReadFalseAndDeletedAtIsNull(currentUserId);
        return new NotificationUnreadCountResponse(unreadCount);
    }

    // 알림 1개를 읽음 처리하는 메서드
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

    // 안 읽은 알림을 한 번에 전부 읽음 처리하는 메서드
    @Transactional
    public NotificationReadAllResponse markAllAsRead(Long currentUserId) {
        LocalDateTime now = LocalDateTime.now();
        int updatedCount = notificationRepository.markAllAsRead(currentUserId, now);

        return new NotificationReadAllResponse(updatedCount, now);
    }

    // 내 쪽지에 일반 댓글이 달렸을 때 알림을 만드는 메서드
    // 단, 내가 내 쪽지에 내가 댓글 단 경우는 알림 만들지 않기
    @Transactional
    public void notifyNoteCommented(User receiver, Jar jar, NotificationPayload payload) {
        createNotificationIfNeeded(receiver, jar, NotificationType.NOTE_COMMENTED, payload);
    }

    // 내 댓글에 대댓글이 달렸을 때 알림을 만드는 메서드, 자기 자신은 제외
    @Transactional
    public void notifyCommentReplied(Collection<User> candidateReceivers, Jar jar, NotificationPayload payload) {
        createNotificationsForMany(candidateReceivers, jar, NotificationType.COMMENT_REPLIED, payload);
    }

    // 내 쪽지에 리액션이 달렸을 때 알림을 만드는 메서드
    // 내가 내 쪽지에 리액션 누른 경우는 알림 만들지 않기, 리액션 변경은 최종 이모지 기준 payload로 이 메서드를 호출
    @Transactional
    public void notifyNoteReacted(User receiver, Jar jar, NotificationPayload payload) {
        createNotificationIfNeeded(receiver, jar, NotificationType.NOTE_REACTED, payload);
    }

    // 내 저금통에 새 멤버가 입장했을 때 알림을 만드는 메서드
    // 새로 들어온 본인은 제외
    @Transactional
    public void notifyJarMemberJoined(Collection<User> candidateReceivers, Jar jar, NotificationPayload payload) {
        createNotificationsForMany(candidateReceivers, jar, NotificationType.JAR_MEMBER_JOINED, payload);
    }

    // 알림 1개를 실제로 저장할지 판단하는 공통 메서드
    // receiver가 null이면 중단, payload가 null이면 중단, actorUserId와 receiver의 id가 같으면(자기 자신이면) 중단,
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

        // 내가 내 글/내 댓글/내 저금통에 한 행동이면 알림 만들지 않기
        if (actorUserId != null && receiverId.equals(actorUserId)) {
            return;
        }

        Notification notification = Notification.create(receiver, jar, type, payload);
        notificationRepository.save(notification);
    }

    // 여러 명에게 알림을 보낼 때 사용하는 공통 메서드
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

            // 이미 처리한 사용자는 중복 저장하지 않기
            if (!processedReceiverIds.add(receiver.getId())) {
                continue;
            }

            createNotificationIfNeeded(receiver, jar, type, payload);
        }
    }

    /*
     * Notification 엔티티를 화면에 보여줄 응답 DTO로 바꾸는 메서드
     * 여기서 message도 같이 만들어서 내려주면 프론트가 훨씬 편하게 화면에 그릴 수 있음
     */
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

    // 알림 종류에 따라 사용자에게 보여줄 문구를 만드는 메서드
    private String buildMessage(NotificationType type, String actorName, String emoji) {
        String safeActorName = (actorName == null || actorName.isBlank()) ? "누군가" : actorName;

        return switch (type) {
            case NOTE_COMMENTED -> safeActorName + "님이 내 쪽지에 댓글을 남겼어요.";
            case COMMENT_REPLIED -> safeActorName + "님이 내 댓글에 답글을 남겼어요.";
            case NOTE_REACTED -> safeActorName + "님이 내 쪽지에 " + (emoji == null ? "" : emoji + " ") + "리액션을 남겼어요.";
            case JAR_MEMBER_JOINED -> safeActorName + "님이 저금통에 참여했어요.";
        };
    }
}