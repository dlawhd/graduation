package com.example.demo.service.notification;

import com.example.demo.dto.notification.response.NotificationListResponse;
import com.example.demo.dto.notification.response.NotificationReadAllResponse;
import com.example.demo.dto.notification.response.NotificationReadResponse;
import com.example.demo.dto.notification.response.NotificationUnreadCountResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.notification.Notification;
import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarTheme;
import com.example.demo.enums.notification.NotificationType;
import com.example.demo.model.notification.NotificationPayload;
import com.example.demo.repository.notification.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    private NotificationRepository notificationRepository;

    private NotificationService notificationService;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @BeforeEach
    void setUp() {
        notificationService = new NotificationService(notificationRepository, messagingTemplate);
    }

    @Test
    @DisplayName("getMyNotifications는 내 알림 목록을 최신순으로 조회하고 화면 응답으로 변환한다")
    void getMyNotifications_returnsMappedNotificationList() {
        // given
        Long currentUserId = 1L;
        User receiver = createUser(currentUserId, "수신자");
        User actor = createUser(2L, "민지");
        Jar jar = createJar(10L, receiver);

        NotificationPayload commentPayload = payload(jar.getJarId(), 100L, 1000L, actor, null);
        Notification commented = createNotification(
                200L,
                receiver,
                jar,
                NotificationType.NOTE_COMMENTED,
                commentPayload,
                LocalDateTime.of(2026, 4, 17, 12, 0)
        );

        NotificationPayload reactionPayload = payload(jar.getJarId(), 101L, null, actor, "LOVE");
        Notification reacted = createNotification(
                201L,
                receiver,
                jar,
                NotificationType.NOTE_REACTED,
                reactionPayload,
                LocalDateTime.of(2026, 4, 17, 12, 10)
        );

        Page<Notification> notificationPage = new PageImpl<>(
                List.of(reacted, commented),
                Pageable.ofSize(2).withPage(1),
                5
        );

        when(notificationRepository.findByUser_IdAndDeletedAtIsNull(eq(currentUserId), any(Pageable.class)))
                .thenReturn(notificationPage);

        // when
        NotificationListResponse response = notificationService.getMyNotifications(currentUserId, 1, 2);

        // then
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(2);
        assertThat(response.totalElements()).isEqualTo(5);
        assertThat(response.totalPages()).isEqualTo(3);
        assertThat(response.items()).hasSize(2);

        assertThat(response.items().get(0).notificationId()).isEqualTo(201L);
        assertThat(response.items().get(0).type()).isEqualTo(NotificationType.NOTE_REACTED);
        assertThat(response.items().get(0).message()).isEqualTo("민지님이 내 쪽지에 LOVE 리액션을 남겼어요.");
        assertThat(response.items().get(0).jarId()).isEqualTo(10L);
        assertThat(response.items().get(0).noteId()).isEqualTo(101L);
        assertThat(response.items().get(0).actorUserId()).isEqualTo(2L);
        assertThat(response.items().get(0).actorName()).isEqualTo("민지");
        assertThat(response.items().get(0).emoji()).isEqualTo("LOVE");

        assertThat(response.items().get(1).notificationId()).isEqualTo(200L);
        assertThat(response.items().get(1).message()).isEqualTo("민지님이 내 쪽지에 댓글을 남겼어요.");
        assertThat(response.items().get(1).commentId()).isEqualTo(1000L);

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(notificationRepository).findByUser_IdAndDeletedAtIsNull(eq(currentUserId), pageableCaptor.capture());

        Pageable pageable = pageableCaptor.getValue();
        assertThat(pageable.getPageNumber()).isEqualTo(1);
        assertThat(pageable.getPageSize()).isEqualTo(2);
        assertThat(pageable.getSort().getOrderFor("createdAt").getDirection()).isEqualTo(Sort.Direction.DESC);
        assertThat(pageable.getSort().getOrderFor("notificationId").getDirection()).isEqualTo(Sort.Direction.DESC);
    }

    @Test
    @DisplayName("getUnreadCount는 현재 사용자의 읽지 않은 알림 수를 반환한다")
    void getUnreadCount_returnsUnreadCount() {
        // given
        when(notificationRepository.countByUser_IdAndIsReadFalseAndDeletedAtIsNull(1L)).thenReturn(3L);

        // when
        NotificationUnreadCountResponse response = notificationService.getUnreadCount(1L);

        // then
        assertThat(response.unreadCount()).isEqualTo(3L);
    }

    @Test
    @DisplayName("markAsRead는 내 알림을 읽음 처리하고 응답을 반환한다")
    void markAsRead_marksNotificationAsRead() {
        // given
        User receiver = createUser(1L, "수신자");
        User actor = createUser(2L, "민지");
        Jar jar = createJar(10L, receiver);
        Notification notification = createNotification(
                200L,
                receiver,
                jar,
                NotificationType.NOTE_COMMENTED,
                payload(jar.getJarId(), 100L, 1000L, actor, null),
                LocalDateTime.of(2026, 4, 17, 12, 0)
        );

        when(notificationRepository.findByNotificationIdAndUser_IdAndDeletedAtIsNull(200L, 1L))
                .thenReturn(Optional.of(notification));

        // when
        NotificationReadResponse response = notificationService.markAsRead(1L, 200L);

        // then
        assertThat(response.notificationId()).isEqualTo(200L);
        assertThat(response.isRead()).isTrue();
        assertThat(response.readAt()).isNotNull();
        assertThat(notification.isRead()).isTrue();
        assertThat(notification.getReadAt()).isEqualTo(response.readAt());
    }

    @Test
    @DisplayName("markAsRead는 내 알림이 없으면 404 예외를 던진다")
    void markAsRead_throwsNotFoundWhenNotificationDoesNotExist() {
        // given
        when(notificationRepository.findByNotificationIdAndUser_IdAndDeletedAtIsNull(200L, 1L))
                .thenReturn(Optional.empty());

        // when
        ResponseStatusException exception = catchThrowableOfType(
                () -> notificationService.markAsRead(1L, 200L),
                ResponseStatusException.class
        );

        // then
        assertThat(exception.getStatusCode().value()).isEqualTo(404);
        assertThat(exception.getReason()).isEqualTo("알림을 찾을 수 없어요.");
    }

    @Test
    @DisplayName("markAllAsRead는 읽음 처리된 개수와 처리 시간을 반환한다")
    void markAllAsRead_returnsUpdatedCountAndReadAt() {
        // given
        when(notificationRepository.markAllAsRead(eq(1L), any(LocalDateTime.class))).thenReturn(4);

        // when
        NotificationReadAllResponse response = notificationService.markAllAsRead(1L);

        // then
        assertThat(response.updatedCount()).isEqualTo(4);
        assertThat(response.readAt()).isNotNull();
        verify(notificationRepository).markAllAsRead(eq(1L), eq(response.readAt()));
    }

    @Test
    @DisplayName("notifyNoteCommented는 작성자와 수신자가 다르면 알림을 저장한다")
    void notifyNoteCommented_savesNotificationWhenReceiverIsNotActor() {
        // given
        User receiver = createUser(1L, "수신자");
        User actor = createUser(2L, "민지");
        Jar jar = createJar(10L, receiver);
        NotificationPayload payload = payload(jar.getJarId(), 100L, 1000L, actor, null);

        mockSaveAndFlush();

        // when
        notificationService.notifyNoteCommented(receiver, jar, payload);

        // then
        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).saveAndFlush(captor.capture());

        Notification savedNotification = captor.getValue();
        assertThat(savedNotification.getUser()).isEqualTo(receiver);
        assertThat(savedNotification.getJar()).isEqualTo(jar);
        assertThat(savedNotification.getType()).isEqualTo(NotificationType.NOTE_COMMENTED);
        assertThat(savedNotification.getPayload()).isEqualTo(payload);
        assertThat(savedNotification.isRead()).isFalse();
        assertThat(savedNotification.getReadAt()).isNull();
    }

    @Test
    @DisplayName("notifyNoteCommented는 자기 자신에게는 알림을 만들지 않는다")
    void notifyNoteCommented_skipsSelfNotification() {
        // given
        User actor = createUser(1L, "민지");
        Jar jar = createJar(10L, actor);
        NotificationPayload payload = payload(jar.getJarId(), 100L, 1000L, actor, null);

        // when
        notificationService.notifyNoteCommented(actor, jar, payload);

        // then
        verify(notificationRepository, never()).saveAndFlush(any(Notification.class));
    }

    @Test
    @DisplayName("notifyCommentReplied는 중복 수신자와 작성자를 제외하고 알림을 만든다")
    void notifyCommentReplied_savesNotificationsForDistinctReceiversExceptActor() {
        // given
        User receiverOne = createUser(1L, "수신자1");
        User receiverTwo = createUser(2L, "수신자2");
        User actor = createUser(3L, "민지");
        User unsavedUser = createUser(null, "미저장");
        Jar jar = createJar(10L, receiverOne);
        NotificationPayload payload = payload(jar.getJarId(), 100L, 1000L, actor, null);

        mockSaveAndFlush();

        // when
        notificationService.notifyCommentReplied(
                List.of(receiverOne, receiverTwo, receiverOne, actor, unsavedUser),
                jar,
                payload
        );

        // then
        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository, times(2)).saveAndFlush(captor.capture());

        assertThat(captor.getAllValues())
                .extracting(Notification::getUser)
                .containsExactly(receiverOne, receiverTwo);
        assertThat(captor.getAllValues())
                .extracting(Notification::getType)
                .containsOnly(NotificationType.COMMENT_REPLIED);
    }

    @Test
    @DisplayName("notifyJarMemberJoined는 수신자 목록이나 payload가 없으면 아무것도 저장하지 않는다")
    void notifyJarMemberJoined_skipsWhenReceiversOrPayloadAreMissing() {
        // given
        User receiver = createUser(1L, "수신자");
        Jar jar = createJar(10L, receiver);

        // when
        notificationService.notifyJarMemberJoined(null, jar, payload(10L, null, null, receiver, null));
        notificationService.notifyJarMemberJoined(List.of(receiver), jar, null);

        // then
        verifyNoInteractions(notificationRepository);
    }

    private Notification createNotification(
            Long notificationId,
            User user,
            Jar jar,
            NotificationType type,
            NotificationPayload payload,
            LocalDateTime createdAt
    ) {
        Notification notification = Notification.create(user, jar, type, payload);
        ReflectionTestUtils.setField(notification, "notificationId", notificationId);
        ReflectionTestUtils.setField(notification, "createdAt", createdAt);
        ReflectionTestUtils.setField(notification, "updatedAt", createdAt);
        return notification;
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

    private User createUser(Long userId, String name) {
        User user = User.builder()
                .email(userId == null ? null : "user" + userId + "@example.com")
                .name(name)
                .birthyear("2000")
                .provider("LOCAL")
                .providerId(userId == null ? "unsaved" : "provider-" + userId)
                .build();
        ReflectionTestUtils.setField(user, "id", userId);
        return user;
    }

    private Jar createJar(Long jarId, User owner) {
        Jar jar = Jar.builder()
                .owner(owner)
                .name("알림 테스트 저금통")
                .description("알림 테스트용")
                .theme(JarTheme.COUPLE)
                .maxMembers(5)
                .openAt(LocalDateTime.of(2027, 4, 17, 0, 0))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.META_ONLY)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", jarId);
        return jar;
    }

    /*
     * saveAndFlush mock 설정 메서드
     *
     * NotificationService는 알림을 저장한 직후
     * notificationId, createdAt 같은 값을 이용해서 WebSocket 응답을 만든다.
     *
     * 그런데 단위 테스트에서는 진짜 DB가 없어서
     * Mockito가 saveAndFlush 결과를 자동으로 만들어주지 않는다.
     *
     * 그래서 테스트용으로:
     * - 저장된 알림에 notificationId를 넣어주고
     * - createdAt / updatedAt도 넣어준 뒤
     * - 그 알림을 그대로 반환하게 만든다.
     */
    private void mockSaveAndFlush() {
        when(notificationRepository.saveAndFlush(any(Notification.class)))
                .thenAnswer(invocation -> {
                    Notification notification = invocation.getArgument(0);

                    ReflectionTestUtils.setField(notification, "notificationId", 999L);
                    ReflectionTestUtils.setField(
                            notification,
                            "createdAt",
                            LocalDateTime.of(2026, 4, 30, 12, 0)
                    );
                    ReflectionTestUtils.setField(
                            notification,
                            "updatedAt",
                            LocalDateTime.of(2026, 4, 30, 12, 0)
                    );

                    return notification;
                });
    }
}
