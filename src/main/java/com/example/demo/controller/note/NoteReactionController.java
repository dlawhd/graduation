package com.example.demo.controller.note;

import com.example.demo.dto.note.request.NoteReactionCreateRequest;
import com.example.demo.dto.note.response.NoteReactionSummaryResponse;
import com.example.demo.dto.response.ApiResponse;
import com.example.demo.service.note.NoteReactionService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/*
 * 이 클래스는 "쪽지 리액션 API 요청"을 받는 컨트롤러야.
 *
 * 쉽게 말하면:
 * - 프론트가 리액션 버튼을 눌렀을 때
 * - 이 컨트롤러가 요청을 받아서
 * - NoteReactionService에게 일을 시키고
 * - 결과를 다시 프론트에 돌려주는 역할을 해.
 *
 * 담당 API
 * 1) POST   /api/v1/jars/{jarId}/notes/{noteId}/reactions
 *    -> 리액션 등록 / 변경 / 같은 값이면 취소
 *
 * 2) DELETE /api/v1/jars/{jarId}/notes/{noteId}/reactions
 *    -> 내가 누른 리액션 삭제
 *
 * 3) GET    /api/v1/jars/{jarId}/notes/{noteId}/reactions
 *    -> 현재 쪽지의 리액션 요약 조회
 */
@RestController
@RequestMapping("/api/v1/jars/{jarId}/notes/{noteId}/reactions")
public class NoteReactionController {

    private final NoteReactionService noteReactionService;

    public NoteReactionController(NoteReactionService noteReactionService) {
        this.noteReactionService = noteReactionService;
    }

    /*
     * 리액션 등록 / 변경 / 같은 값이면 취소
     *
     * 프론트가
     * {
     *   "emoji": "LOVE"
     * }
     * 같은 값을 보내면 서비스가 현재 상태를 보고
     * 저장 / 변경 / 취소 중 하나를 처리해.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<NoteReactionSummaryResponse>> react(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long noteId,
            @Valid @RequestBody NoteReactionCreateRequest request
    ) {
        // 현재 로그인한 사용자 id 꺼내기
        Long currentUserId = getCurrentUserId(authentication);

        // 서비스에게 실제 리액션 처리 맡기기
        NoteReactionSummaryResponse response = noteReactionService.react(
                currentUserId,
                jarId,
                noteId,
                request.emoji()
        );

        // 성공 응답을 { data: ... } 형태로 감싸서 반환
        return ResponseEntity.ok(ApiResponse.of(response));
    }

    /*
     * 내가 누른 리액션 삭제
     *
     * v1에서는 "한 사람이 한 쪽지에 리액션 1개만" 가능하니까
     * 어떤 emoji인지 다시 안 받아도 돼.
     * 현재 로그인 사용자 + noteId만 알면
     * 내 리액션 1개를 정확히 지울 수 있어.
     */
    @DeleteMapping
    public ResponseEntity<ApiResponse<NoteReactionSummaryResponse>> deleteMyReaction(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long noteId
    ) {
        // 현재 로그인한 사용자 id 꺼내기
        Long currentUserId = getCurrentUserId(authentication);

        // 서비스에게 삭제 맡기기
        NoteReactionSummaryResponse response = noteReactionService.deleteMyReaction(
                currentUserId,
                jarId,
                noteId
        );

        // 삭제 후 최신 요약 상태 반환
        return ResponseEntity.ok(ApiResponse.of(response));
    }

    /*
     * 현재 쪽지의 리액션 요약 조회
     *
     * 상세 모달을 열었을 때
     * - 내가 누른 리액션이 뭔지
     * - LOVE, SMILE 같은 리액션 개수가 각각 몇 개인지
     * 보여주기 위해 사용해.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<NoteReactionSummaryResponse>> getSummary(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long noteId
    ) {
        // 현재 로그인한 사용자 id 꺼내기
        Long currentUserId = getCurrentUserId(authentication);

        // 서비스에게 요약 조회 맡기기
        NoteReactionSummaryResponse response = noteReactionService.getSummary(
                currentUserId,
                jarId,
                noteId
        );

        // 성공 응답 반환
        return ResponseEntity.ok(ApiResponse.of(response));
    }

    /*
     * Spring Security Authentication 안에서 현재 로그인 사용자 id를 꺼내는 함수야.
     *
     * 현재 프로젝트에서는 principal 안에 userId가 Map 형태로 들어있는 구조를 쓰고 있어서
     * 그 값만 안전하게 꺼내오면 돼.
     *
     * 예:
     * principal = {userId=1}
     */
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

        // 혹시 문자열로 들어온 경우까지 대비해서 숫자로 변환
        try {
            return Long.parseLong(String.valueOf(userIdValue));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인 정보가 올바르지 않아.");
        }
    }
}