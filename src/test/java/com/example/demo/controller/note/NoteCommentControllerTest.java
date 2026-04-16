package com.example.demo.controller.note;

import com.example.demo.auth.OAuth2SuccessHandler;
import com.example.demo.dto.note.request.NoteCommentCreateRequest;
import com.example.demo.dto.note.request.NoteCommentUpdateRequest;
import com.example.demo.dto.note.response.NoteCommentItem;
import com.example.demo.dto.note.response.NoteCommentListResponse;
import com.example.demo.jwt.JwtAuthenticationFilter;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.note.NoteCommentService;
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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(NoteCommentController.class)
@AutoConfigureMockMvc(addFilters = false)
@ActiveProfiles("test")
class NoteCommentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private NoteCommentService noteCommentService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private OAuth2SuccessHandler oAuth2SuccessHandler;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @DisplayName("댓글 생성 성공 - 201 Created")
    void createComment_success() throws Exception {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;

        NoteCommentCreateRequest request = new NoteCommentCreateRequest("첫 댓글", null);
        NoteCommentItem response = new NoteCommentItem(
                300L,
                currentUserId,
                "테스트유저",
                null,
                "첫 댓글",
                OffsetDateTime.parse("2026-04-15T10:00:00+09:00"),
                OffsetDateTime.parse("2026-04-15T10:00:00+09:00"),
                List.of()
        );

        when(noteCommentService.createComment(eq(currentUserId), eq(jarId), eq(noteId), eq(request)))
                .thenReturn(response);

        mockMvc.perform(post("/api/v1/jars/{jarId}/notes/{noteId}/comments", jarId, noteId)
                        .principal(authWithUserId(currentUserId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.commentId").value(300L))
                .andExpect(jsonPath("$.data.userId").value(1L))
                .andExpect(jsonPath("$.data.authorName").value("테스트유저"))
                .andExpect(jsonPath("$.data.parentCommentId").doesNotExist())
                .andExpect(jsonPath("$.data.content").value("첫 댓글"))
                .andExpect(jsonPath("$.data.replies").isArray());

        verify(noteCommentService).createComment(currentUserId, jarId, noteId, request);
    }

    @Test
    @DisplayName("댓글 목록 조회 성공 - 200 OK")
    void getCommentList_success() throws Exception {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;

        NoteCommentListResponse response = new NoteCommentListResponse(List.of(
                new NoteCommentItem(
                        300L,
                        1L,
                        "테스트유저",
                        null,
                        "첫 댓글",
                        OffsetDateTime.parse("2026-04-15T10:00:00+09:00"),
                        OffsetDateTime.parse("2026-04-15T10:00:00+09:00"),
                        List.of(new NoteCommentItem(
                                301L,
                                2L,
                                "답글유저",
                                300L,
                                "첫 답글",
                                OffsetDateTime.parse("2026-04-15T10:10:00+09:00"),
                                OffsetDateTime.parse("2026-04-15T10:10:00+09:00"),
                                List.of()
                        ))
                )
        ));

        when(noteCommentService.getCommentList(currentUserId, jarId, noteId)).thenReturn(response);

        mockMvc.perform(get("/api/v1/jars/{jarId}/notes/{noteId}/comments", jarId, noteId)
                        .principal(authWithUserId(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].commentId").value(300L))
                .andExpect(jsonPath("$.data.items[0].content").value("첫 댓글"))
                .andExpect(jsonPath("$.data.items[0].replies[0].commentId").value(301L))
                .andExpect(jsonPath("$.data.items[0].replies[0].parentCommentId").value(300L));

        verify(noteCommentService).getCommentList(currentUserId, jarId, noteId);
    }

    @Test
    @DisplayName("댓글 수정 성공 - 200 OK")
    void updateComment_success() throws Exception {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        Long commentId = 300L;

        NoteCommentUpdateRequest request = new NoteCommentUpdateRequest("수정 댓글");
        NoteCommentItem response = new NoteCommentItem(
                commentId,
                currentUserId,
                "테스트유저",
                null,
                "수정 댓글",
                OffsetDateTime.parse("2026-04-15T10:00:00+09:00"),
                OffsetDateTime.parse("2026-04-15T10:30:00+09:00"),
                List.of()
        );

        when(noteCommentService.updateComment(eq(currentUserId), eq(jarId), eq(noteId), eq(commentId), eq(request)))
                .thenReturn(response);

        mockMvc.perform(patch("/api/v1/jars/{jarId}/notes/{noteId}/comments/{commentId}", jarId, noteId, commentId)
                        .principal(authWithUserId(currentUserId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.commentId").value(300L))
                .andExpect(jsonPath("$.data.content").value("수정 댓글"));

        verify(noteCommentService).updateComment(currentUserId, jarId, noteId, commentId, request);
    }

    @Test
    @DisplayName("댓글 삭제 성공 - 204 No Content")
    void deleteComment_success() throws Exception {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        Long commentId = 300L;

        mockMvc.perform(delete("/api/v1/jars/{jarId}/notes/{noteId}/comments/{commentId}", jarId, noteId, commentId)
                        .principal(authWithUserId(currentUserId)))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        verify(noteCommentService).deleteComment(currentUserId, jarId, noteId, commentId);
    }

    @Test
    @DisplayName("댓글 생성 실패 - 인증 정보 없으면 401")
    void createComment_unauthorized_whenAuthenticationIsNull() throws Exception {
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes/{noteId}/comments", 10L, 100L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "content": "댓글"
                                }
                                """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("댓글 생성 실패 - content 비어 있으면 400")
    void createComment_badRequest_whenContentIsBlank() throws Exception {
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes/{noteId}/comments", 10L, 100L)
                        .principal(authWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "content": ""
                                }
                                """))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(noteCommentService);
    }

    @Test
    @DisplayName("댓글 조회 실패 - principal이 Map이 아니면 401")
    void getCommentList_unauthorized_whenPrincipalIsNotMap() throws Exception {
        Authentication authentication = new UsernamePasswordAuthenticationToken("user", null, List.of());

        mockMvc.perform(get("/api/v1/jars/{jarId}/notes/{noteId}/comments", 10L, 100L)
                        .with(authentication(authentication)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("댓글 조회 실패 - userId 형식 이상하면 401")
    void getCommentList_unauthorized_whenUserIdFormatIsInvalid() throws Exception {
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes/{noteId}/comments", 10L, 100L)
                        .with(authentication(authWithUserId("abc"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("댓글 생성 성공 - principal userId가 문자열이어도 처리")
    void createComment_success_whenUserIdIsString() throws Exception {
        Long jarId = 10L;
        Long noteId = 100L;
        NoteCommentCreateRequest request = new NoteCommentCreateRequest("문자열 userId 댓글", null);
        NoteCommentItem response = new NoteCommentItem(
                301L,
                1L,
                "테스트유저",
                null,
                "문자열 userId 댓글",
                OffsetDateTime.parse("2026-04-15T11:00:00+09:00"),
                OffsetDateTime.parse("2026-04-15T11:00:00+09:00"),
                List.of()
        );

        when(noteCommentService.createComment(eq(1L), eq(jarId), eq(noteId), eq(request)))
                .thenReturn(response);

        mockMvc.perform(post("/api/v1/jars/{jarId}/notes/{noteId}/comments", jarId, noteId)
                        .principal(authWithUserId("1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.commentId").value(301L))
                .andExpect(jsonPath("$.data.userId").value(1L));

        verify(noteCommentService).createComment(1L, jarId, noteId, request);
    }

    private Authentication authWithUserId(Object userIdValue) {
        return new UsernamePasswordAuthenticationToken(
                Map.of("userId", userIdValue),
                null,
                List.of()
        );
    }
}
