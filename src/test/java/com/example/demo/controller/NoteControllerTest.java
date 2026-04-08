package com.example.demo.controller;

import com.example.demo.auth.OAuth2SuccessHandler;
import com.example.demo.dto.note.request.NoteAttachmentCreateRequest;
import com.example.demo.dto.note.request.NoteCreateRequest;
import com.example.demo.dto.note.response.NoteCreateResponse;
import com.example.demo.dto.note.response.NoteDetailResponse;
import com.example.demo.dto.note.response.NoteListItem;
import com.example.demo.dto.note.response.NoteListResponse;
import com.example.demo.jwt.JwtAuthenticationFilter;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.note.NoteService;
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

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(NoteController.class)
@AutoConfigureMockMvc(addFilters = false)
@ActiveProfiles("test")
class NoteControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private NoteService noteService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private OAuth2SuccessHandler oAuth2SuccessHandler;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @DisplayName("쪽지 작성 성공 - 201 Created")
    void createNote_success() throws Exception {
        // given
        Long jarId = 10L;
        Long currentUserId = 1L;

        NoteCreateRequest request = new NoteCreateRequest(
                "첫 번째 쪽지",
                "오늘도 화이팅!",
                LocalDate.of(2026, 3, 31),
                "서울",
                List.of()
        );

        NoteCreateResponse response = new NoteCreateResponse(
                100L,
                jarId,
                currentUserId,
                "첫 번째 쪽지",
                "오늘도 화이팅!",
                false,
                LocalDate.of(2026, 3, 31),
                "서울",
                OffsetDateTime.parse("2026-03-31T12:00:00+09:00")
        );

        when(noteService.createNote(eq(currentUserId), eq(jarId), eq(request)))
                .thenReturn(response);

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes", jarId)
                        .principal(authWithUserId(currentUserId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.noteId").value(100L))
                .andExpect(jsonPath("$.data.jarId").value(10L))
                .andExpect(jsonPath("$.data.authorId").value(1L))
                .andExpect(jsonPath("$.data.title").value("첫 번째 쪽지"))
                .andExpect(jsonPath("$.data.content").value("오늘도 화이팅!"))
                .andExpect(jsonPath("$.data.isEncrypted").value(false))
                .andExpect(jsonPath("$.data.noteDate").value("2026-03-31"))
                .andExpect(jsonPath("$.data.location").value("서울"))
                .andExpect(jsonPath("$.data.createdAt").value("2026-03-31T12:00:00+09:00"));

        verify(noteService).createNote(currentUserId, jarId, request);
    }

    @Test
    @DisplayName("쪽지 작성 실패 - 인증 정보 없으면 401")
    void createNote_unauthorized_whenAuthenticationIsNull() throws Exception {
        // given
        Long jarId = 10L;

        NoteCreateRequest request = new NoteCreateRequest(
                "첫 번째 쪽지",
                "오늘도 화이팅!",
                LocalDate.of(2026, 3, 31),
                "서울",
                List.of()
        );

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes", jarId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("쪽지 작성 성공 - principal의 userId가 String이어도 숫자로 바꿔서 처리")
    void createNote_success_whenUserIdIsString() throws Exception {
        // given
        Long jarId = 10L;
        String userId = "1";

        NoteCreateRequest request = new NoteCreateRequest(
                "문자열 userId 테스트",
                "잘 변환되는지 확인",
                LocalDate.of(2026, 3, 31),
                "부산",
                List.of()
        );

        NoteCreateResponse response = new NoteCreateResponse(
                101L,
                jarId,
                1L,
                "문자열 userId 테스트",
                "잘 변환되는지 확인",
                false,
                LocalDate.of(2026, 3, 31),
                "부산",
                OffsetDateTime.parse("2026-03-31T13:00:00+09:00")
        );

        when(noteService.createNote(eq(1L), eq(jarId), eq(request)))
                .thenReturn(response);

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes", jarId)
                        .principal(authWithUserId(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.noteId").value(101L))
                .andExpect(jsonPath("$.data.authorId").value(1L));

        verify(noteService).createNote(1L, jarId, request);
    }

    @Test
    @DisplayName("쪽지 작성 실패 - principal의 userId 형식이 이상하면 401")
    void createNote_unauthorized_whenUserIdFormatIsInvalid() throws Exception {
        // given
        Long jarId = 10L;

        NoteCreateRequest request = new NoteCreateRequest(
                "이상한 userId",
                "내용",
                LocalDate.of(2026, 3, 31),
                "서울"
                ,List.of()
        );

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes", jarId)
                        .with(authentication(authWithUserId("abc")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }
    @Test
    @DisplayName("쪽지 작성 성공 - 첨부파일 포함 요청")
    void createNote_success_withAttachments() throws Exception {
        Long jarId = 10L;
        Long currentUserId = 1L;

        NoteCreateRequest request = new NoteCreateRequest(
                "첨부 있는 쪽지",
                "사진도 같이 저장",
                LocalDate.of(2026, 3, 31),
                "서울",
                List.of(
                        new NoteAttachmentCreateRequest(
                                "notes/2026/04/08/test.png",
                                "https://esjh-files.s3.ap-northeast-2.amazonaws.com/notes/2026/04/08/test.png",
                                null,
                                "image/png",
                                13345L
                        )
                )
        );

        NoteCreateResponse response = new NoteCreateResponse(
                101L,
                jarId,
                currentUserId,
                "첨부 있는 쪽지",
                "사진도 같이 저장",
                false,
                LocalDate.of(2026, 3, 31),
                "서울",
                OffsetDateTime.parse("2026-03-31T12:30:00+09:00")
        );

        when(noteService.createNote(eq(currentUserId), eq(jarId), eq(request)))
                .thenReturn(response);

        mockMvc.perform(post("/api/v1/jars/{jarId}/notes", jarId)
                        .principal(authWithUserId(currentUserId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.noteId").value(101L))
                .andExpect(jsonPath("$.data.title").value("첨부 있는 쪽지"));

        verify(noteService).createNote(currentUserId, jarId, request);
    }

    @Test
    @DisplayName("쪽지 목록 조회 성공 - 200 OK")
    void listNotes_success() throws Exception {
        // given
        Long jarId = 10L;
        Long currentUserId = 1L;

        NoteListItem item = new NoteListItem(
                200L,
                "제목",
                "미리보기 내용",
                LocalDate.of(2026, 3, 30),
                "서울",
                2L,
                "현수",
                false,
                OffsetDateTime.parse("2026-03-30T10:00:00+09:00"),
                List.of()
        );

        NoteListResponse response = new NoteListResponse(
                List.of(item),
                0,
                20,
                1L,
                1
        );

        when(noteService.listNotes(currentUserId, jarId, 0, 20))
                .thenReturn(response);

        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes", jarId)
                        .principal(authWithUserId(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].noteId").value(200L))
                .andExpect(jsonPath("$.data.items[0].title").value("제목"))
                .andExpect(jsonPath("$.data.items[0].previewContent").value("미리보기 내용"))
                .andExpect(jsonPath("$.data.items[0].authorId").value(2L))
                .andExpect(jsonPath("$.data.items[0].authorName").value("현수"))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(20))
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.totalPages").value(1))
                .andExpect(jsonPath("$.data.items[0].attachments").isArray())
                .andExpect(jsonPath("$.data.items[0].attachments.length()").value(0));

        verify(noteService).listNotes(currentUserId, jarId, 0, 20);
    }

    @Test
    @DisplayName("쪽지 상세 조회 성공 - 200 OK")
    void getNoteDetail_success() throws Exception {
        // given
        Long jarId = 10L;
        Long noteId = 300L;
        Long currentUserId = 1L;

        NoteDetailResponse response = new NoteDetailResponse(
                noteId,
                jarId,
                2L,
                "현수",
                "상세 제목",
                "상세 내용",
                false,
                LocalDate.of(2026, 3, 29),
                "제주",
                OffsetDateTime.parse("2026-03-29T09:00:00+09:00"),
                OffsetDateTime.parse("2026-03-29T09:10:00+09:00"),
                List.of()
        );

        when(noteService.getNoteDetail(currentUserId, jarId, noteId))
                .thenReturn(response);

        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes/{noteId}", jarId, noteId)
                        .principal(authWithUserId(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.noteId").value(300L))
                .andExpect(jsonPath("$.data.jarId").value(10L))
                .andExpect(jsonPath("$.data.authorId").value(2L))
                .andExpect(jsonPath("$.data.authorName").value("현수"))
                .andExpect(jsonPath("$.data.title").value("상세 제목"))
                .andExpect(jsonPath("$.data.content").value("상세 내용"))
                .andExpect(jsonPath("$.data.noteDate").value("2026-03-29"))
                .andExpect(jsonPath("$.data.location").value("제주"))
                .andExpect(jsonPath("$.data.attachments").isArray())
                .andExpect(jsonPath("$.data.attachments.length()").value(0));

        verify(noteService).getNoteDetail(currentUserId, jarId, noteId);
    }

    private Authentication authWithUserId(Object userIdValue) {
        return new UsernamePasswordAuthenticationToken(
                Map.of("userId", userIdValue),
                null,
                List.of()
        );
    }
}