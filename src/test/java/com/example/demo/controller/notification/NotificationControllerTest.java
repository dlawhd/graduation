package com.example.demo.controller.notification;

import com.example.demo.auth.OAuth2SuccessHandler;
import com.example.demo.dto.notification.response.NotificationItemResponse;
import com.example.demo.dto.notification.response.NotificationListResponse;
import com.example.demo.dto.notification.response.NotificationReadAllResponse;
import com.example.demo.dto.notification.response.NotificationReadResponse;
import com.example.demo.dto.notification.response.NotificationUnreadCountResponse;
import com.example.demo.enums.notification.NotificationType;
import com.example.demo.jwt.JwtAuthenticationFilter;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.notification.NotificationService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(NotificationController.class)
@AutoConfigureMockMvc(addFilters = false)
@ActiveProfiles("test")
class NotificationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private NotificationService notificationService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private OAuth2SuccessHandler oAuth2SuccessHandler;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @DisplayName("알림 목록 조회 성공 - 200 OK와 알림 목록을 반환한다")
    void getMyNotifications_success() throws Exception {
        // given
        Long currentUserId = 1L;
        LocalDateTime createdAt = LocalDateTime.of(2026, 4, 17, 12, 0);
        NotificationListResponse response = new NotificationListResponse(
                List.of(new NotificationItemResponse(
                        100L,
                        NotificationType.NOTE_COMMENTED,
                        "민지님이 내 쪽지에 댓글을 남겼어요.",
                        false,
                        null,
                        createdAt,
                        10L,
                        20L,
                        30L,
                        2L,
                        "민지",
                        null
                )),
                1,
                2,
                5L,
                3
        );

        when(notificationService.getMyNotifications(currentUserId, 1, 2)).thenReturn(response);

        // when & then
        mockMvc.perform(get("/api/v1/notifications")
                        .principal(authWithUserId(currentUserId))
                        .param("page", "1")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.size").value(2))
                .andExpect(jsonPath("$.data.totalElements").value(5))
                .andExpect(jsonPath("$.data.totalPages").value(3))
                .andExpect(jsonPath("$.data.items[0].notificationId").value(100))
                .andExpect(jsonPath("$.data.items[0].type").value("NOTE_COMMENTED"))
                .andExpect(jsonPath("$.data.items[0].message").value("민지님이 내 쪽지에 댓글을 남겼어요."))
                .andExpect(jsonPath("$.data.items[0].isRead").value(false))
                .andExpect(jsonPath("$.data.items[0].createdAt").value("2026-04-17T12:00:00"))
                .andExpect(jsonPath("$.data.items[0].jarId").value(10))
                .andExpect(jsonPath("$.data.items[0].noteId").value(20))
                .andExpect(jsonPath("$.data.items[0].commentId").value(30))
                .andExpect(jsonPath("$.data.items[0].actorUserId").value(2))
                .andExpect(jsonPath("$.data.items[0].actorName").value("민지"));

        verify(notificationService).getMyNotifications(currentUserId, 1, 2);
    }

    @Test
    @DisplayName("알림 목록 조회 성공 - page와 size 기본값을 사용한다")
    void getMyNotifications_usesDefaultPageAndSize() throws Exception {
        // given
        NotificationListResponse response = new NotificationListResponse(List.of(), 0, 10, 0L, 0);
        when(notificationService.getMyNotifications(1L, 0, 10)).thenReturn(response);

        // when & then
        mockMvc.perform(get("/api/v1/notifications")
                        .principal(authWithUserId("1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(10));

        verify(notificationService).getMyNotifications(1L, 0, 10);
    }

    @Test
    @DisplayName("알림 목록 조회 실패 - page가 음수이면 400")
    void getMyNotifications_badRequestWhenPageIsNegative() throws Exception {
        // when & then
        mockMvc.perform(get("/api/v1/notifications")
                        .principal(authWithUserId(1L))
                        .param("page", "-1")
                        .param("size", "10"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.error.message").value("page는 0 이상이어야 해요."));

        verifyNoInteractions(notificationService);
    }

    @Test
    @DisplayName("알림 목록 조회 실패 - size가 범위를 벗어나면 400")
    void getMyNotifications_badRequestWhenSizeIsOutOfRange() throws Exception {
        // when & then
        mockMvc.perform(get("/api/v1/notifications")
                        .principal(authWithUserId(1L))
                        .param("page", "0")
                        .param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.error.message").value("size는 1 이상 100 이하여야 해요."));

        verifyNoInteractions(notificationService);
    }

    @Test
    @DisplayName("안 읽은 알림 수 조회 성공 - 200 OK와 unreadCount를 반환한다")
    void getUnreadCount_success() throws Exception {
        // given
        when(notificationService.getUnreadCount(1L))
                .thenReturn(new NotificationUnreadCountResponse(7L));

        // when & then
        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .principal(authWithUserId(1L)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unreadCount").value(7));

        verify(notificationService).getUnreadCount(1L);
    }

    @Test
    @DisplayName("단건 읽음 처리 성공 - 200 OK와 읽음 처리 결과를 반환한다")
    void markAsRead_success() throws Exception {
        // given
        LocalDateTime readAt = LocalDateTime.of(2026, 4, 17, 12, 30);
        when(notificationService.markAsRead(1L, 100L))
                .thenReturn(new NotificationReadResponse(100L, true, readAt));

        // when & then
        mockMvc.perform(post("/api/v1/notifications/{notificationId}/read", 100L)
                        .principal(authWithUserId(1L)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.notificationId").value(100))
                .andExpect(jsonPath("$.data.isRead").value(true))
                .andExpect(jsonPath("$.data.readAt").value("2026-04-17T12:30:00"));

        verify(notificationService).markAsRead(1L, 100L);
    }

    @Test
    @DisplayName("전체 읽음 처리 성공 - 200 OK와 처리 개수를 반환한다")
    void markAllAsRead_success() throws Exception {
        // given
        LocalDateTime readAt = LocalDateTime.of(2026, 4, 17, 12, 40);
        when(notificationService.markAllAsRead(1L))
                .thenReturn(new NotificationReadAllResponse(4, readAt));

        // when & then
        mockMvc.perform(post("/api/v1/notifications/read-all")
                        .principal(authWithUserId(1L)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updatedCount").value(4))
                .andExpect(jsonPath("$.data.readAt").value("2026-04-17T12:40:00"));

        verify(notificationService).markAllAsRead(1L);
    }

    @Test
    @DisplayName("인증 실패 - authentication이 없으면 401")
    void request_unauthorizedWhenAuthenticationIsMissing() throws Exception {
        // when & then
        mockMvc.perform(get("/api/v1/notifications/unread-count"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.error.message").value("로그인이 필요해요."));

        verifyNoInteractions(notificationService);
    }

    @Test
    @DisplayName("인증 실패 - principal의 userId 형식이 잘못되면 401")
    void request_unauthorizedWhenUserIdFormatIsInvalid() throws Exception {
        // when & then
        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .principal(authWithUserId("abc")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.error.message").value("로그인 사용자 번호 형식이 올바르지 않아요."));

        verifyNoInteractions(notificationService);
    }

    @Test
    @DisplayName("인증 성공 - principal 자체가 숫자이면 사용자 ID로 사용한다")
    void request_successWhenPrincipalIsNumber() throws Exception {
        // given
        when(notificationService.getUnreadCount(1L))
                .thenReturn(new NotificationUnreadCountResponse(2L));

        // when & then
        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .principal(authWithPrincipal(1L)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unreadCount").value(2));

        verify(notificationService).getUnreadCount(1L);
    }

    private Authentication authWithUserId(Object userId) {
        return authWithPrincipal(Map.of("userId", userId));
    }

    private Authentication authWithPrincipal(Object principal) {
        return new UsernamePasswordAuthenticationToken(principal, null, List.of());
    }
}
