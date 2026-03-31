package com.example.demo.controller;

import com.example.demo.dto.note.request.NoteCreateRequest;
import com.example.demo.dto.note.response.NoteCreateResponse;
import com.example.demo.dto.note.response.NoteDetailResponse;
import com.example.demo.dto.note.response.NoteListResponse;
import com.example.demo.dto.response.ApiResponse;
import com.example.demo.service.note.NoteService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/v1/jars/{jarId}/notes")
public class NoteController {

    private final NoteService noteService;

    public NoteController(NoteService noteService) {
        this.noteService = noteService;
    }

    // POST /api/v1/jars/{jarId}/notes
    // 쪽지 작성 API
    @PostMapping
    public ResponseEntity<ApiResponse<NoteCreateResponse>> createNote(
            Authentication authentication,
            @PathVariable Long jarId,
            @Valid @RequestBody NoteCreateRequest request
    ) {

        // 1. 현재 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스에 작성 요청 맡기기
        NoteCreateResponse response = noteService.createNote(currentUserId, jarId, request);

        // 3. 201 Created + 공통 성공 응답으로 반환
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.of(response));
    }

    // 현재 로그인한 사용자 id를 Authentication 안에서 꺼내는 메서드
    // 우리 프로젝트는 principal 안에 Map 형태로 userId가 들어있는 구조를 사용 중
    private Long extractCurrentUserId(Authentication authentication) {

        // 인증 정보 자체가 없으면 로그인 안 된 상태
        if (authentication == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "인증이 필요합니다.");
        }

        Object principal = authentication.getPrincipal();

        // principal 이 Map 구조라면 그 안에서 userId 찾기
        if (principal instanceof Map<?, ?> map) {
            Object userIdValue = map.get("userId");

            // Long이면 그대로 사용
            if (userIdValue instanceof Long userId) {
                return userId;
            }

            // Integer면 Long으로 바꿔서 사용
            if (userIdValue instanceof Integer userId) {
                return userId.longValue();
            }

            // String이면 숫자로 바꿔서 사용
            if (userIdValue instanceof String userId) {
                try {
                    return Long.parseLong(userId);
                } catch (NumberFormatException e) {
                    throw new ResponseStatusException(UNAUTHORIZED, "userId 형식이 올바르지 않습니다.");
                }
            }
        }

        // 여기까지 왔으면 principal 구조가 예상과 다름
        throw new ResponseStatusException(UNAUTHORIZED, "인증 사용자 정보를 읽을 수 없습니다.");
    }

    // 쪽지 목록 조회 API
    @GetMapping
    public ApiResponse<NoteListResponse> listNotes(
            Authentication authentication,
            @PathVariable Long jarId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Long currentUserId = extractCurrentUserId(authentication);

        NoteListResponse response = noteService.listNotes(currentUserId, jarId, page, size);

        return ApiResponse.of(response);
    }

    // 쪽지 상세 조회 API
    @GetMapping("/{noteId}")
    public ApiResponse<NoteDetailResponse> getNoteDetail(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long noteId
    ) {
        Long currentUserId = extractCurrentUserId(authentication);

        NoteDetailResponse response =
                noteService.getNoteDetail(currentUserId, jarId, noteId);

        return ApiResponse.of(response);
    }
}