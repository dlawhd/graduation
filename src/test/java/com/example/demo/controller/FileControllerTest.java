package com.example.demo.controller;

import com.example.demo.dto.file.request.FileCompleteRequest;
import com.example.demo.dto.file.request.FilePresignRequest;
import com.example.demo.dto.file.response.FileCompleteResponse;
import com.example.demo.dto.file.response.FilePresignResponse;
import com.example.demo.enums.file.FilePurpose;
import com.example.demo.jwt.JwtAuthenticationFilter;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.file.FileService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// FileController의 요청/응답이 제대로 동작하는지 확인하는 테스트 클래스
@WebMvcTest(FileController.class)
@AutoConfigureMockMvc(addFilters = false)
@ActiveProfiles("test")
class FileControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private FileService fileService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Test
    @DisplayName("presign 요청 성공 - 200 OK 와 data 응답을 반환한다")
    void createPresignedUrl_success() throws Exception {
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                12345L
        );

        FilePresignResponse response = new FilePresignResponse(
                "https://presigned-upload-url",
                "notes/2026/04/05/uuid.png",
                "https://cdn.esjh.shop/notes/2026/04/05/uuid.png",
                OffsetDateTime.parse("2026-04-05T12:00:00+09:00")
        );

        // 서비스 메서드가 (Long, FilePresignRequest)로 바뀌었으니
        // 테스트도 인자 2개로 맞춰줘야 해.
        given(fileService.createPresignedUrl(anyLong(), any(FilePresignRequest.class)))
                .willReturn(response);

        mockMvc.perform(post("/api/v1/files/presign")
                        .principal(authenticationWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.data.uploadUrl").value("https://presigned-upload-url"))
                .andExpect(jsonPath("$.data.s3Key").value("notes/2026/04/05/uuid.png"))
                .andExpect(jsonPath("$.data.publicUrl").value("https://cdn.esjh.shop/notes/2026/04/05/uuid.png"))
                .andExpect(jsonPath("$.data.expiresAt").value("2026-04-05T12:00:00+09:00"));

        verify(fileService).createPresignedUrl(anyLong(), any(FilePresignRequest.class));
    }

    @Test
    @DisplayName("presign 요청 실패 - purpose가 없으면 400")
    void createPresignedUrl_fail_purposeIsNull() throws Exception {
        String invalidRequest = """
                {
                  "purpose": null,
                  "fileName": "photo.png",
                  "contentType": "image/png",
                  "size": 12345
                }
                """;

        mockMvc.perform(post("/api/v1/files/presign")
                        .principal(authenticationWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidRequest))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("presign 요청 실패 - fileName이 비어 있으면 400")
    void createPresignedUrl_fail_fileNameIsBlank() throws Exception {
        String invalidRequest = """
                {
                  "purpose": "NOTE",
                  "fileName": "",
                  "contentType": "image/png",
                  "size": 12345
                }
                """;

        mockMvc.perform(post("/api/v1/files/presign")
                        .principal(authenticationWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidRequest))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("presign 요청 실패 - contentType이 비어 있으면 400")
    void createPresignedUrl_fail_contentTypeIsBlank() throws Exception {
        String invalidRequest = """
                {
                  "purpose": "NOTE",
                  "fileName": "photo.png",
                  "contentType": "",
                  "size": 12345
                }
                """;

        mockMvc.perform(post("/api/v1/files/presign")
                        .principal(authenticationWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidRequest))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("presign 요청 실패 - size가 0이면 400")
    void createPresignedUrl_fail_sizeIsZero() throws Exception {
        String invalidRequest = """
                {
                  "purpose": "NOTE",
                  "fileName": "photo.png",
                  "contentType": "image/png",
                  "size": 0
                }
                """;

        mockMvc.perform(post("/api/v1/files/presign")
                        .principal(authenticationWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidRequest))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("complete 요청 성공 - 200 OK 와 data 응답을 반환한다")
    void completeUpload_success() throws Exception {
        FileCompleteResponse response = new FileCompleteResponse(
                "notes/2026/04/05/uuid.png",
                FilePurpose.NOTE,
                "https://cdn.esjh.shop/notes/2026/04/05/uuid.png",
                "image/png",
                12345L,
                OffsetDateTime.parse("2026-04-05T12:10:00+09:00")
        );

        given(fileService.completeUpload(anyLong(), any(FileCompleteRequest.class)))
                .willReturn(response);

        String request = """
                {
                  "purpose": "NOTE",
                  "s3Key": "notes/2026/04/05/uuid.png"
                }
                """;

        mockMvc.perform(post("/api/v1/files/complete")
                        .principal(authenticationWithUserId(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.s3Key").value("notes/2026/04/05/uuid.png"))
                .andExpect(jsonPath("$.data.purpose").value("NOTE"))
                .andExpect(jsonPath("$.data.publicUrl").value("https://cdn.esjh.shop/notes/2026/04/05/uuid.png"))
                .andExpect(jsonPath("$.data.contentType").value("image/png"))
                .andExpect(jsonPath("$.data.size").value(12345));

        verify(fileService).completeUpload(anyLong(), any(FileCompleteRequest.class));
    }

    // 테스트용 로그인 사용자 만들기
    // 컨트롤러가 principal 안에서 userId를 꺼내기 때문에
    // Map 형태로 넣어주는 게 중요해.
    private Authentication authenticationWithUserId(Long userId) {
        return new TestingAuthenticationToken(
                Map.of("userId", userId),
                null
        );
    }
}