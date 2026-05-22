package shop.esjh.memoryjar.controller.note;

import shop.esjh.memoryjar.dto.note.request.NoteCommentCreateRequest;
import shop.esjh.memoryjar.dto.note.request.NoteCommentUpdateRequest;
import shop.esjh.memoryjar.dto.note.response.NoteCommentItem;
import shop.esjh.memoryjar.dto.note.response.NoteCommentListResponse;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.note.NoteCommentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

// 이 컨트롤러가 요청을 먼저 받고, 실제 일은 NoteCommentService에게 맡긴 뒤
// 결과를 다시 프론트에 돌려주는 역할을 함
@RestController
@RequestMapping("/api/v1/jars/{jarId}/notes/{noteId}/comments")
public class NoteCommentController {

    private final NoteCommentService noteCommentService;

    public NoteCommentController(NoteCommentService noteCommentService) {
        this.noteCommentService = noteCommentService;
    }

    // 댓글 작성 API
    @PostMapping
    public ResponseEntity<ApiResponse<NoteCommentItem>> createComment(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long noteId,
            @Valid @RequestBody NoteCommentCreateRequest request
    ) {

        // 현재 로그인한 사용자 id 꺼내기
        Long currentUserId = getCurrentUserId(authentication);

        // 서비스에게 댓글 작성 맡기기
        NoteCommentItem response = noteCommentService.createComment(
                currentUserId,
                jarId,
                noteId,
                request
        );

        // 201 Created + 공통 성공 응답으로 반환
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.of(response));
    }

    // 댓글 목록 조회 API
    // 컨트롤러는 현재 사용자와 어느 쪽지의 댓글인지만 전달
    @GetMapping
    public ResponseEntity<ApiResponse<NoteCommentListResponse>> getCommentList(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long noteId
    ) {
        // 현재 로그인한 사용자 id 꺼내기
        Long currentUserId = getCurrentUserId(authentication);

        // 서비스에게 댓글 목록 조회 맡기기
        NoteCommentListResponse response = noteCommentService.getCommentList(
                currentUserId,
                jarId,
                noteId
        );

        // 성공 응답 반환
        return ResponseEntity.ok(ApiResponse.of(response));
    }

    // 댓글 수정 API
    @PatchMapping("/{commentId}")
    public ResponseEntity<ApiResponse<NoteCommentItem>> updateComment(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long noteId,
            @PathVariable Long commentId,
            @Valid @RequestBody NoteCommentUpdateRequest request
    ) {
        // 현재 로그인한 사용자 id 꺼내기
        Long currentUserId = getCurrentUserId(authentication);

        // 서비스에게 댓글 수정 맡기기
        NoteCommentItem response = noteCommentService.updateComment(
                currentUserId,
                jarId,
                noteId,
                commentId,
                request
        );

        // 성공 응답 반환
        return ResponseEntity.ok(ApiResponse.of(response));
    }

    // 댓글 삭제 API
    @DeleteMapping("/{commentId}")
    public ResponseEntity<Void> deleteComment(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long noteId,
            @PathVariable Long commentId
    ) {
        // 현재 로그인한 사용자 id 꺼내기
        Long currentUserId = getCurrentUserId(authentication);

        // 서비스에게 댓글 삭제 맡기기
        noteCommentService.deleteComment(
                currentUserId,
                jarId,
                noteId,
                commentId
        );

        // 삭제 성공, 응답 바디는 없음
        return ResponseEntity.noContent().build();
    }

    // 현재 로그인 사용자 id를 꺼내는 함수
    // 현재 프로젝트에서는 principal 안에 userId가 Map 형태로 들어있는 구조를 쓰고 있어.
    private Long getCurrentUserId(Authentication authentication) {
        // 로그인 정보 자체가 없으면 401
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인이 필요해.");
        }

        // principal이 Map 형태인지 확인
        Object principal = authentication.getPrincipal();
        if (!(principal instanceof Map<?, ?> principalMap)) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인 정보가 올바르지 않아.");
        }

        // userId 값 꺼내기
        Object userIdValue = principalMap.get("userId");
        if (userIdValue == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인 정보가 올바르지 않아.");
        }

        // Number 타입이면 long 값으로 변환
        if (userIdValue instanceof Number number) {
            return number.longValue();
        }

        // 문자열로 들어온 경우도 대비
        try {
            return Long.parseLong(String.valueOf(userIdValue));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인 정보가 올바르지 않아.");
        }
    }
}