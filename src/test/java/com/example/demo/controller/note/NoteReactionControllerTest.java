package com.example.demo.controller.note;

import com.example.demo.auth.OAuth2SuccessHandler;
import com.example.demo.dto.note.request.NoteReactionCreateRequest;
import com.example.demo.dto.note.response.NoteReactionCountItem;
import com.example.demo.dto.note.response.NoteReactionSummaryResponse;
import com.example.demo.enums.note.NoteReactionEmoji;
import com.example.demo.jwt.JwtAuthenticationFilter;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.note.NoteReactionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// 이 테스트는 NoteReactionController가 요청을 올바르게 받고 서비스에 정확한 값을 넘기는지 확인한다.
// 리액션 기능은 프론트에서 자주 호출되는 API라서 성공 응답과 인증/검증 실패 응답이 흔들리지 않게
// 웹 계층 기준으로 먼저 고정해두는 목적이 있다.
@WebMvcTest(NoteReactionController.class)
@AutoConfigureMockMvc(addFilters = false)
@ActiveProfiles("test")
class NoteReactionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private NoteReactionService noteReactionService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private OAuth2SuccessHandler oAuth2SuccessHandler;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @DisplayName("리액션 등록 성공 - 200 OK와 최신 요약을 돌려준다")
    void react_success() throws Exception {
        // given
        Long jarId = 10L;
        Long noteId = 100L;
        Long currentUserId = 1L;

        NoteReactionCreateRequest request = new NoteReactionCreateRequest(NoteReactionEmoji.LOVE);

        NoteReactionSummaryResponse response = new NoteReactionSummaryResponse(
                noteId,
                NoteReactionEmoji.LOVE,
                List.of(new NoteReactionCountItem(NoteReactionEmoji.LOVE, 1L))
        );

        when(noteReactionService.react(eq(currentUserId), eq(jarId), eq(noteId), eq(NoteReactionEmoji.LOVE)))
                .thenReturn(response);

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes/{noteId}/reactions", jarId, noteId)
                        .principal(authWithUserId(currentUserId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.noteId").value(100L))
                .andExpect(jsonPath("$.data.myReaction").value("LOVE"))
                .andExpect(jsonPath("$.data.counts[0].emoji").value("LOVE"))
                .andExpect(jsonPath("$.data.counts[0].count").value(1));

        verify(noteReactionService).react(currentUserId, jarId, noteId, NoteReactionEmoji.LOVE);
    }

    @Test
    @DisplayName("리액션 등록 성공 - principal의 userId가 문자열이어도 숫자로 바꿔 처리한다")
    void react_success_whenUserIdIsString() throws Exception {
        // given
        Long jarId = 10L;
        Long noteId = 100L;

        NoteReactionCreateRequest request = new NoteReactionCreateRequest(NoteReactionEmoji.SMILE);

        NoteReactionSummaryResponse response = new NoteReactionSummaryResponse(
                noteId,
                NoteReactionEmoji.SMILE,
                List.of(new NoteReactionCountItem(NoteReactionEmoji.SMILE, 1L))
        );

        when(noteReactionService.react(1L, jarId, noteId, NoteReactionEmoji.SMILE))
                .thenReturn(response);

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes/{noteId}/reactions", jarId, noteId)
                        .principal(authWithUserId("1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.myReaction").value("SMILE"));

        verify(noteReactionService).react(1L, jarId, noteId, NoteReactionEmoji.SMILE);
    }

    @Test
    @DisplayName("리액션 등록 실패 - 인증 정보가 없으면 401")
    void react_unauthorized_whenAuthenticationIsNull() throws Exception {
        // given
        String request = """
            {
              "emoji": "LOVE"
            }
            """;

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes/{noteId}/reactions", 10L, 100L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("리액션 등록 실패 - emoji가 없으면 400")
    void react_badRequest_whenEmojiIsMissing() throws Exception {
        // given
        String request = """
            {
              "emoji": null
            }
            """;

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes/{noteId}/reactions", 10L, 100L)
                        .principal(authWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(noteReactionService);
    }

    @Test
    @DisplayName("리액션 등록 실패 - principal의 userId 형식이 이상하면 401")
    void react_unauthorized_whenUserIdFormatIsInvalid() throws Exception {
        // given
        String request = """
            {
              "emoji": "LOVE"
            }
            """;

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes/{noteId}/reactions", 10L, 100L)
                        .with(authentication(authWithUserId("abc")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("리액션 삭제 성공 - 200 OK와 최신 요약을 돌려준다")
    void deleteMyReaction_success() throws Exception {
        // given
        Long jarId = 10L;
        Long noteId = 101L;
        Long currentUserId = 1L;

        NoteReactionSummaryResponse response = new NoteReactionSummaryResponse(
                noteId,
                null,
                List.of()
        );

        when(noteReactionService.deleteMyReaction(currentUserId, jarId, noteId))
                .thenReturn(response);

        // when & then
        mockMvc.perform(delete("/api/v1/jars/{jarId}/notes/{noteId}/reactions", jarId, noteId)
                        .principal(authWithUserId(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.noteId").value(101L))
                .andExpect(jsonPath("$.data.myReaction").doesNotExist())
                .andExpect(jsonPath("$.data.counts").isArray())
                .andExpect(jsonPath("$.data.counts.length()").value(0));

        verify(noteReactionService).deleteMyReaction(currentUserId, jarId, noteId);
    }

    @Test
    @DisplayName("리액션 삭제 실패 - 인증 정보가 없으면 401")
    void deleteMyReaction_unauthorized_whenAuthenticationIsNull() throws Exception {
        // when & then
        mockMvc.perform(delete("/api/v1/jars/{jarId}/notes/{noteId}/reactions", 10L, 101L))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("리액션 삭제 실패 - principal의 userId 형식이 이상하면 401")
    void deleteMyReaction_unauthorized_whenUserIdFormatIsInvalid() throws Exception {
        // when & then
        mockMvc.perform(delete("/api/v1/jars/{jarId}/notes/{noteId}/reactions", 10L, 101L)
                        .with(authentication(authWithUserId("abc"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("리액션 요약 조회 성공 - 내가 누른 리액션과 개수 목록을 돌려준다")
    void getSummary_success() throws Exception {
        // given
        Long jarId = 10L;
        Long noteId = 102L;
        Long currentUserId = 1L;

        NoteReactionSummaryResponse response = new NoteReactionSummaryResponse(
                noteId,
                NoteReactionEmoji.THANKFUL,
                List.of(
                        new NoteReactionCountItem(NoteReactionEmoji.LOVE, 2L),
                        new NoteReactionCountItem(NoteReactionEmoji.THANKFUL, 1L)
                )
        );

        when(noteReactionService.getSummary(currentUserId, jarId, noteId))
                .thenReturn(response);

        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes/{noteId}/reactions", jarId, noteId)
                        .principal(authWithUserId(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.noteId").value(102L))
                .andExpect(jsonPath("$.data.myReaction").value("THANKFUL"))
                .andExpect(jsonPath("$.data.counts[0].emoji").value("LOVE"))
                .andExpect(jsonPath("$.data.counts[0].count").value(2))
                .andExpect(jsonPath("$.data.counts[1].emoji").value("THANKFUL"))
                .andExpect(jsonPath("$.data.counts[1].count").value(1));

        verify(noteReactionService).getSummary(currentUserId, jarId, noteId);
    }

    @Test
    @DisplayName("리액션 요약 조회 실패 - 인증 정보가 없으면 401")
    void getSummary_unauthorized_whenAuthenticationIsNull() throws Exception {
        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes/{noteId}/reactions", 10L, 102L))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("리액션 요약 조회 실패 - principal의 userId 형식이 이상하면 401")
    void getSummary_unauthorized_whenUserIdFormatIsInvalid() throws Exception {
        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes/{noteId}/reactions", 10L, 102L)
                        .with(authentication(authWithUserId("abc"))))
                .andExpect(status().isUnauthorized());
    }

    private Authentication authWithUserId(Object userIdValue) {
        return new UsernamePasswordAuthenticationToken(
                Map.of("userId", userIdValue),
                null,
                List.of()
        );
    }
}
