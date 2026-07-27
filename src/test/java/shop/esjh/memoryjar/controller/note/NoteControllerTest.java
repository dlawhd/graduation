package shop.esjh.memoryjar.controller.note;

import shop.esjh.memoryjar.auth.OAuth2SuccessHandler;
import shop.esjh.memoryjar.dto.note.request.NoteAttachmentCreateRequest;
import shop.esjh.memoryjar.dto.note.request.NoteCreateRequest;
import shop.esjh.memoryjar.dto.note.response.NoteCreateResponse;
import shop.esjh.memoryjar.dto.note.response.NoteDetailResponse;
import shop.esjh.memoryjar.dto.note.response.NoteListItem;
import shop.esjh.memoryjar.dto.note.response.NoteListResponse;
import shop.esjh.memoryjar.jwt.JwtAuthenticationFilter;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.service.note.NoteService;
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
import static org.mockito.Mockito.verifyNoInteractions;

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
                List.of(),
                List.of("행복", "대박!")
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
                List.of("행복", "대박!"),
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
                List.of(),
                List.of("행복", "대박!")
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
                List.of(),
                List.of("행복", "대박!")
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
                List.of("행복", "대박!"),
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
                "서울",
                List.of(),
                List.of("행복", "대박!")
        );

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/notes", jarId)
                        .with(authentication(authWithUserId("abc")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("쪽지 작성 실패 - title이 비어 있으면 400")
    void createNote_fail_whenTitleIsBlank() throws Exception {
        String invalidRequest = """
            {
              "title": "",
              "content": "내용",
              "noteDate": "2026-03-31",
              "location": "서울",
              "attachments": [],
              "tags": ["행복"]
            }
            """;

        mockMvc.perform(post("/api/v1/jars/{jarId}/notes", 10L)
                        .principal(authWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidRequest))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("쪽지 작성 실패 - content가 비어 있으면 400")
    void createNote_fail_whenContentIsBlank() throws Exception {
        String invalidRequest = """
            {
              "title": "제목",
              "content": "",
              "noteDate": "2026-03-31",
              "location": "서울",
              "attachments": [],
              "tags": ["행복"]
            }
            """;

        mockMvc.perform(post("/api/v1/jars/{jarId}/notes", 10L)
                        .principal(authWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidRequest))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("쪽지 작성 실패 - attachment의 s3Key가 비어 있으면 400")
    void createNote_fail_whenAttachmentS3KeyIsBlank() throws Exception {
        String invalidRequest = """
            {
              "title": "제목",
              "content": "내용",
              "noteDate": "2026-03-31",
              "location": "서울",
              "attachments": [
                { "s3Key": "" }
              ],
              "tags": ["행복"]
            }
            """;

        mockMvc.perform(post("/api/v1/jars/{jarId}/notes", 10L)
                        .principal(authWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidRequest))
                .andExpect(status().isBadRequest());
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
                                "notes/2026/04/08/test.png"
                        )
                ),
                List.of("행복", "대박!")
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
                List.of("행복", "대박!"),
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
                List.of("행복", "대박!"),
                List.of(),
                null,
                List.of(),
                0L
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
    @DisplayName("쪽지 목록 조회 성공 - page와 size를 요청값대로 전달")
    void listNotes_success_withPagingParams() throws Exception {
        Long jarId = 10L;
        Long currentUserId = 1L;

        NoteListResponse response = new NoteListResponse(
                List.of(),
                2,
                5,
                0L,
                0
        );

        when(noteService.listNotes(currentUserId, jarId, 2, 5)).thenReturn(response);

        mockMvc.perform(get("/api/v1/jars/{jarId}/notes", jarId)
                        .param("page", "2")
                        .param("size", "5")
                        .principal(authWithUserId(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(2))
                .andExpect(jsonPath("$.data.size").value(5));

        verify(noteService).listNotes(currentUserId, jarId, 2, 5);
    }

    @Test
    @DisplayName("쪽지 작성 실패 - 첨부파일이 11개면 400")
    void createNote_fail_whenAttachmentsExceedLimit()
            throws Exception {

        // 첨부파일 요청 11개를 만든다.
        List<NoteAttachmentCreateRequest> attachments =
                java.util.stream.IntStream
                        .range(0, 11)
                        .mapToObj(index ->
                                new NoteAttachmentCreateRequest(
                                        "notes/limit/file-" +
                                                index +
                                                ".png"
                                )
                        )
                        .toList();

        NoteCreateRequest request =
                new NoteCreateRequest(
                        "첨부 개수 제한 테스트",
                        "첨부파일이 10개를 넘으면 요청 단계에서 막아야 해.",
                        LocalDate.of(2026, 7, 26),
                        "서울",
                        attachments,
                        List.of("테스트")
                );

        mockMvc.perform(
                        post(
                                "/api/v1/jars/{jarId}/notes",
                                10L
                        )
                                .principal(
                                        authWithUserId(1L)
                                )
                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )
                                .content(
                                        objectMapper
                                                .writeValueAsString(
                                                        request
                                                )
                                )
                )
                .andExpect(
                        status().isBadRequest()
                );

        /*
         * DTO 검증에서 먼저 실패해야 하므로
         * 실제 쪽지 서비스는 호출되지 않아야 한다.
         */
        verifyNoInteractions(noteService);
    }

    @Test
    @DisplayName("쪽지 목록 조회 성공 - principal의 userId가 Integer여도 처리")
    void listNotes_success_whenUserIdIsInteger() throws Exception {
        Long jarId = 10L;

        NoteListResponse response = new NoteListResponse(
                List.of(),
                0,
                20,
                0L,
                0
        );

        when(noteService.listNotes(1L, jarId, 0, 20)).thenReturn(response);

        mockMvc.perform(get("/api/v1/jars/{jarId}/notes", jarId)
                        .principal(authWithUserId(1)))
                .andExpect(status().isOk());

        verify(noteService).listNotes(1L, jarId, 0, 20);
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
                List.of("행복", "대박!"),
                List.of(),
                null,
                List.of(),
                0L
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

    @Test
    @DisplayName("쪽지 목록 조회 실패 - 인증 정보 없으면 401")
    void listNotes_unauthorized_whenAuthenticationIsNull() throws Exception {
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes", 10L))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("쪽지 상세 조회 실패 - 인증 정보 없으면 401")
    void getNoteDetail_unauthorized_whenAuthenticationIsNull() throws Exception {
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes/{noteId}", 10L, 300L))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("쪽지 목록 조회 실패 - principal의 userId 형식이 이상하면 401")
    void listNotes_unauthorized_whenUserIdFormatIsInvalid() throws Exception {
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes", 10L)
                        .with(authentication(authWithUserId("abc"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("쪽지 상세 조회 실패 - principal의 userId 형식이 이상하면 401")
    void getNoteDetail_unauthorized_whenUserIdFormatIsInvalid() throws Exception {
        mockMvc.perform(get("/api/v1/jars/{jarId}/notes/{noteId}", 10L, 300L)
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
