package com.example.demo.controller.chat;

import com.example.demo.controller.chat.ChatController;
import com.example.demo.dto.chat.request.ChatMessageSendRequest;
import com.example.demo.dto.chat.request.ChatReadRequest;
import com.example.demo.dto.chat.response.ChatMessageListResponse;
import com.example.demo.dto.chat.response.ChatMessageResponse;
import com.example.demo.dto.chat.response.ChatUnreadResponse;
import com.example.demo.enums.chat.ChatMessageType;
import com.example.demo.jwt.JwtAuthenticationFilter;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.chat.ChatService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/*
 * ChatControllerTest 역할
 *
 * ChatController가 프론트 요청을 제대로 받고,
 * ChatService를 올바르게 호출한 뒤,
 * 응답을 { "data": ... } 형태로 잘 내려주는지 확인하는 테스트다.
 *
 * 쉽게 말하면:
 * - 채팅 보내기 API가 201을 주는지
 * - 채팅 목록 조회 API가 data.items를 주는지
 * - Polling 새 메시지 조회 API가 동작하는지
 * - 읽음 처리 API가 ok=true를 주는지
 * - unread count API가 안 읽은 개수를 주는지
 *
 * 를 확인한다.
 *
 * 여기서는 Service의 진짜 로직을 테스트하지 않는다.
 * Service는 @MockitoBean으로 가짜 객체를 만들어두고,
 * Controller가 요청/응답 연결을 잘하는지만 확인한다.
 */
@WebMvcTest(
        controllers = ChatController.class,
        properties = {
                "spring.security.oauth2.client.registration.naver.client-id=test-client-id",
                "spring.security.oauth2.client.registration.naver.client-secret=test-client-secret"
        }
)
@AutoConfigureMockMvc(addFilters = false)
class ChatControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private ChatService chatService;

    /*
     * 현재 프로젝트의 다른 ControllerTest와 맞추기 위한 Mock Bean이다.
     *
     * @WebMvcTest는 Controller 주변 Bean만 띄우는데,
     * 보안 관련 Bean 의존성이 있으면 테스트 실행 중 Bean을 찾지 못할 수 있다.
     * 그래서 기존 테스트처럼 JWT 관련 Bean을 가짜로 등록해준다.
     */
    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void sendMessage는_채팅을_저장하고_201을_반환한다() throws Exception {
        // given
        ChatMessageSendRequest request = new ChatMessageSendRequest(" 안녕! ");

        ChatMessageResponse response = new ChatMessageResponse(
                100L,
                10L,
                1L,
                "은서",
                ChatMessageType.TEXT,
                " 안녕! ",
                true,
                LocalDateTime.of(2026, 4, 24, 12, 0)
        );

        given(chatService.sendTextMessage(
                eq(1L),
                eq(10L),
                any(ChatMessageSendRequest.class)
        )).willReturn(response);

        TestingAuthenticationToken auth = authenticatedUser();

        // when & then
        mockMvc.perform(post("/api/v1/jars/10/chat/messages")
                        .principal(auth)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.messageId").value(100))
                .andExpect(jsonPath("$.data.jarId").value(10))
                .andExpect(jsonPath("$.data.senderId").value(1))
                .andExpect(jsonPath("$.data.senderName").value("은서"))
                .andExpect(jsonPath("$.data.type").value("TEXT"))
                .andExpect(jsonPath("$.data.content").value(" 안녕! "))
                .andExpect(jsonPath("$.data.mine").value(true))
                .andExpect(jsonPath("$.data.createdAt").exists());

        verify(chatService).sendTextMessage(
                eq(1L),
                eq(10L),
                any(ChatMessageSendRequest.class)
        );
    }

    @Test
    void sendMessage는_채팅내용이_공백만_있으면_400을_반환한다() throws Exception {
        // given
        ChatMessageSendRequest request = new ChatMessageSendRequest("   ");

        TestingAuthenticationToken auth = authenticatedUser();

        // when & then
        mockMvc.perform(post("/api/v1/jars/10/chat/messages")
                        .principal(auth)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());

        /*
         * @Valid에서 막혀야 하므로 Service까지 가면 안 된다.
         */
    }

    @Test
    void getMessages는_기존_채팅_목록을_반환한다() throws Exception {
        // given
        ChatMessageResponse message1 = new ChatMessageResponse(
                101L,
                10L,
                2L,
                "친구",
                ChatMessageType.TEXT,
                "첫 번째 메시지",
                false,
                LocalDateTime.of(2026, 4, 24, 12, 1)
        );

        ChatMessageResponse message2 = new ChatMessageResponse(
                102L,
                10L,
                1L,
                "은서",
                ChatMessageType.TEXT,
                "두 번째 메시지",
                true,
                LocalDateTime.of(2026, 4, 24, 12, 2)
        );

        ChatMessageListResponse response = ChatMessageListResponse.of(
                List.of(message1, message2),
                true,
                101L
        );

        given(chatService.getMessages(
                eq(1L),
                eq(10L),
                isNull(),
                eq(30)
        )).willReturn(response);

        TestingAuthenticationToken auth = authenticatedUser();

        // when & then
        mockMvc.perform(get("/api/v1/jars/10/chat/messages")
                        .principal(auth)
                        .param("limit", "30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isArray())
                .andExpect(jsonPath("$.data.items[0].messageId").value(101))
                .andExpect(jsonPath("$.data.items[0].senderName").value("친구"))
                .andExpect(jsonPath("$.data.items[0].mine").value(false))
                .andExpect(jsonPath("$.data.items[1].messageId").value(102))
                .andExpect(jsonPath("$.data.items[1].senderName").value("은서"))
                .andExpect(jsonPath("$.data.items[1].mine").value(true))
                .andExpect(jsonPath("$.data.hasNext").value(true))
                .andExpect(jsonPath("$.data.nextBeforeMessageId").value(101));

        verify(chatService).getMessages(
                eq(1L),
                eq(10L),
                isNull(),
                eq(30)
        );
    }

    @Test
    void getMessages는_beforeMessageId로_이전_채팅을_조회한다() throws Exception {
        // given
        ChatMessageResponse message = new ChatMessageResponse(
                90L,
                10L,
                2L,
                "친구",
                ChatMessageType.TEXT,
                "예전 메시지",
                false,
                LocalDateTime.of(2026, 4, 24, 11, 50)
        );

        ChatMessageListResponse response = ChatMessageListResponse.of(
                List.of(message),
                false,
                90L
        );

        given(chatService.getMessages(
                eq(1L),
                eq(10L),
                eq(100L),
                eq(30)
        )).willReturn(response);

        TestingAuthenticationToken auth = authenticatedUser();

        // when & then
        mockMvc.perform(get("/api/v1/jars/10/chat/messages")
                        .principal(auth)
                        .param("beforeMessageId", "100")
                        .param("limit", "30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].messageId").value(90))
                .andExpect(jsonPath("$.data.items[0].content").value("예전 메시지"))
                .andExpect(jsonPath("$.data.hasNext").value(false))
                .andExpect(jsonPath("$.data.nextBeforeMessageId").value(90));

        verify(chatService).getMessages(
                eq(1L),
                eq(10L),
                eq(100L),
                eq(30)
        );
    }

    @Test
    void getNewMessages는_Polling용_새_메시지를_반환한다() throws Exception {
        // given
        ChatMessageResponse newMessage = new ChatMessageResponse(
                201L,
                10L,
                2L,
                "친구",
                ChatMessageType.TEXT,
                "새 메시지",
                false,
                LocalDateTime.of(2026, 4, 24, 12, 10)
        );

        ChatMessageListResponse response = ChatMessageListResponse.of(
                List.of(newMessage),
                false,
                null
        );

        given(chatService.getNewMessages(
                eq(1L),
                eq(10L),
                eq(200L),
                eq(30)
        )).willReturn(response);

        TestingAuthenticationToken auth = authenticatedUser();

        // when & then
        mockMvc.perform(get("/api/v1/jars/10/chat/messages/new")
                        .principal(auth)
                        .param("afterMessageId", "200")
                        .param("limit", "30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isArray())
                .andExpect(jsonPath("$.data.items[0].messageId").value(201))
                .andExpect(jsonPath("$.data.items[0].content").value("새 메시지"))
                .andExpect(jsonPath("$.data.items[0].mine").value(false))
                .andExpect(jsonPath("$.data.hasNext").value(false))
                .andExpect(jsonPath("$.data.nextBeforeMessageId").doesNotExist());

        verify(chatService).getNewMessages(
                eq(1L),
                eq(10L),
                eq(200L),
                eq(30)
        );
    }

    @Test
    void markAsRead는_읽음_처리_후_ok_true를_반환한다() throws Exception {
        // given
        ChatReadRequest request = new ChatReadRequest(300L);

        TestingAuthenticationToken auth = authenticatedUser();

        // when & then
        mockMvc.perform(post("/api/v1/jars/10/chat/read")
                        .principal(auth)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));

        verify(chatService).markAsRead(
                eq(1L),
                eq(10L),
                any(ChatReadRequest.class)
        );
    }

    @Test
    void markAsRead는_lastReadMessageId가_없으면_400을_반환한다() throws Exception {
        // given
        Map<String, Object> request = Map.of();

        TestingAuthenticationToken auth = authenticatedUser();

        // when & then
        mockMvc.perform(post("/api/v1/jars/10/chat/read")
                        .principal(auth)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getUnreadCount는_안읽은_채팅_개수를_반환한다() throws Exception {
        // given
        ChatUnreadResponse response = new ChatUnreadResponse(
                10L,
                3L
        );

        given(chatService.getUnreadCount(
                eq(1L),
                eq(10L)
        )).willReturn(response);

        TestingAuthenticationToken auth = authenticatedUser();

        // when & then
        mockMvc.perform(get("/api/v1/jars/10/chat/unread")
                        .principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jarId").value(10))
                .andExpect(jsonPath("$.data.unreadCount").value(3));

        verify(chatService).getUnreadCount(
                eq(1L),
                eq(10L)
        );
    }

    /*
     * 테스트용 인증 사용자 만들기
     *
     * 현재 프로젝트 ControllerTest에서는
     * principal 안에 userId, email, name을 Map으로 넣는 방식을 사용한다.
     *
     * ChatController의 extractCurrentUserId()는
     * 이 Map에서 userId를 꺼내서 사용한다.
     */
    private TestingAuthenticationToken authenticatedUser() {
        return new TestingAuthenticationToken(
                Map.of(
                        "userId", 1L,
                        "email", "user@test.com",
                        "name", "은서"
                ),
                null,
                "ROLE_USER"
        );
    }
}