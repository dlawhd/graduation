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
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// 알림을 DB에 저장한 뒤 /topic/users/{userId}/notifications 주소로 실시간 전송한다.
@Service
@Transactional(readOnly = true)
public class NotificationService {

    // 알림 DB 작업을 담당하는 Repository
    private final NotificationRepository notificationRepository;

    // WebSocket으로 프론트에게 메시지를 보내는 도구
    private final SimpMessagingTemplate messagingTemplate;

    public NotificationService(
            NotificationRepository notificationRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.notificationRepository = notificationRepository;
        this.messagingTemplate = messagingTemplate;
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

    /*
     * 안 읽은 알림 개수를 조회하는 메서드
     *
     * 헤더의 빨간 숫자 뱃지에 사용하는 값
     */
    public NotificationUnreadCountResponse getUnreadCount(Long currentUserId) {
        long unreadCount =
                notificationRepository.countByUser_IdAndIsReadFalseAndDeletedAtIsNull(currentUserId);

        return new NotificationUnreadCountResponse(unreadCount);
    }

    // 알림 1개를 읽음 처리하는 메서드
    @Transactional
    public NotificationReadResponse markAsRead(Long currentUserId, Long notificationId) {
        Notification notification = notificationRepository
                .findByNotificationIdAndUser_IdAndDeletedAtIsNull(notificationId, currentUserId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "알림을 찾을 수 없어요."
                ));

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

    // 내 쪽지에 댓글이 달렸을 때 알림을 만드는 메서드
    @Transactional
    public void notifyNoteCommented(User receiver, Jar jar, NotificationPayload payload) {
        createNotificationIfNeeded(receiver, jar, NotificationType.NOTE_COMMENTED, payload);
    }

    // 내 댓글에 답글이 달렸을 때 알림을 만드는 메서드
    @Transactional
    public void notifyCommentReplied(
            Collection<User> candidateReceivers,
            Jar jar,
            NotificationPayload payload
    ) {
        createNotificationsForMany(candidateReceivers, jar, NotificationType.COMMENT_REPLIED, payload);
    }

    // 내 쪽지에 리액션이 달렸을 때 알림을 만드는 메서드
    @Transactional
    public void notifyNoteReacted(User receiver, Jar jar, NotificationPayload payload) {
        createNotificationIfNeeded(receiver, jar, NotificationType.NOTE_REACTED, payload);
    }

    // 저금통에 새 멤버가 들어왔을 때 알림을 만드는 메서드
    @Transactional
    public void notifyJarMemberJoined(
            Collection<User> candidateReceivers,
            Jar jar,
            NotificationPayload payload
    ) {
        createNotificationsForMany(candidateReceivers, jar, NotificationType.JAR_MEMBER_JOINED, payload);
    }

    /*
     * 알림 1개를 실제로 저장할지 판단하는 공통 메서드
     *
     * 여기서 하는 일:
     * 1. 받을 사람이 없으면 중단
     * 2. payload가 없으면 중단
     * 3. 내가 내 글에 한 행동이면 중단
     * 4. DB에 알림 저장
     * 5. WebSocket으로 프론트에 실시간 전송
     */
    private void createNotificationIfNeeded(
            User receiver,
            Jar jar,
            NotificationType type,
            NotificationPayload payload
    ) {
        if (receiver == null || payload == null) {
            return;
        }

        Long receiverId = receiver.getId();
        Long actorUserId = payload.actorUserId();

        if (receiverId == null) {
            return;
        }

        // 내가 내 글/내 댓글/내 저금통에 한 행동이면 알림을 만들지 않는다.
        if (actorUserId != null && receiverId.equals(actorUserId)) {
            return;
        }

        Notification notification = Notification.create(receiver, jar, type, payload);

        /*
         * saveAndFlush를 쓰는 이유:
         * - 저장 직후 notificationId, createdAt 같은 값이 바로 필요하기 때문
         * - 이 값을 WebSocket 응답으로 보내야 프론트가 목록에 바로 꽂을 수 있음
         */
        Notification savedNotification = notificationRepository.saveAndFlush(notification);

        NotificationItemResponse response = toNotificationItemResponse(savedNotification);

        sendRealtimeNotificationAfterCommit(receiverId, response);
    }

    /*
     * 여러 명에게 알림을 보낼 때 사용하는 공통 메서드
     *
     * 같은 사람이 중복으로 들어와도 알림이 2번 저장되지 않도록 Set으로 막는다.
     */
    private void createNotificationsForMany(
            Collection<User> candidateReceivers,
            Jar jar,
            NotificationType type,
            NotificationPayload payload
    ) {
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

    /*
     * DB 저장이 성공적으로 끝난 뒤 WebSocket으로 새 알림을 보내는 메서드
     *
     * 왜 afterCommit을 쓰냐면?
     * - DB 저장이 실패했는데 프론트에는 알림이 간 것처럼 보이면 안 되기 때문
     * - 그래서 "DB 저장 확정!" 이후에만 WebSocket을 보낸다.
     */
    private void sendRealtimeNotificationAfterCommit(
            Long receiverId,
            NotificationItemResponse response
    ) {
        Runnable sendTask = () -> messagingTemplate.convertAndSend(
                "/topic/users/" + receiverId + "/notifications",
                response
        );

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    sendTask.run();
                }
            });
            return;
        }

        sendTask.run();
    }

    /*
     * Notification 엔티티를 화면에 보여줄 응답 DTO로 바꾸는 메서드
     *
     * 프론트는 이 응답 하나만 받으면:
     * - 알림 목록에 추가할 수 있고
     * - 뱃지도 올릴 수 있고
     * - 클릭 시 해당 저금통/쪽지/댓글 위치로 이동할 수 있음
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
        String safeActorName =
                (actorName == null || actorName.isBlank()) ? "알 수 없는 사용자" : actorName;

        return switch (type) {
            case NOTE_COMMENTED ->
                    safeActorName + "님이 내 쪽지에 댓글을 남겼어요.";

            case COMMENT_REPLIED ->
                    safeActorName + "님이 내 댓글에 답글을 남겼어요.";

            case NOTE_REACTED ->
                    safeActorName + "님이 내 쪽지에 "
                            + (emoji == null || emoji.isBlank() ? "" : emoji + " ")
                            + "리액션을 남겼어요.";

            case JAR_MEMBER_JOINED ->
                    safeActorName + "님이 저금통에 참여했어요.";
        };
    }
}