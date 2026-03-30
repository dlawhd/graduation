package com.example.demo.controller;

import com.example.demo.dto.jar.request.*;
import com.example.demo.dto.jar.response.*;
import com.example.demo.dto.response.ApiResponse;
import com.example.demo.service.jar.JarService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

// 브라우저/프론트가 "저금통 만들어줘", "목록 보여줘", "초대코드로 들어갈게" 같은 요청을 보내면 이 컨트롤러가 먼저 요청을 받고
// 계산은 JarService에게 맡긴 다음 결과를 ApiResponse 형태로 돌려주는 역할
// 1) 로그인한 사용자 id 꺼내기
// 2) 요청값 받기
// 3) service 호출하기
// 4) 응답 감싸서 반환하기
@RestController
@RequestMapping("/api/v1/jars")
public class JarController {

    private final JarService jarService;

    public JarController(JarService jarService) {
        this.jarService = jarService;
    }

    // POST /api/v1/jars
    // 저금통 생성 API
    // 요청: name, description, theme, maxMembers, openAt, openMode, lockLevel
    // 응답: 생성된 jar 정보 + 내 역할(OWNER)
    @PostMapping
    public ResponseEntity<ApiResponse<JarCreateResponse>> createJar(
            Authentication authentication,
            @Valid @RequestBody JarCreateRequest request
    ) {

        // 1. 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스 호출해서 저금통 생성
        JarCreateResponse response = jarService.createJar(currentUserId, request);

        // 3. 201 Created + {data: ...} 형태로 반환
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.of(response));
    }

    // 내가 속한 저금통 목록 조회 API
    // page: 몇 번째 페이지인지
    // size: 한 번에 몇 개 보여줄지
    @GetMapping
    public ApiResponse<JarListResponse> listMyJars(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {

        // 1. 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스 호출해서 목록 조회
        JarListResponse response = jarService.listMyJars(currentUserId, page, size);

        // 3. 공통 성공 응답으로 감싸서 반환
        return ApiResponse.of(response);
    }

    // GET /api/v1/jars/{jarId}
    // 저금통 상세 조회 API
    @GetMapping("/{jarId}")
    public ApiResponse<JarDetailResponse> getJarDetail(
            Authentication authentication,
            @PathVariable Long jarId
    ) {

        // 1. 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스 호출해서 상세 조회
        JarDetailResponse response = jarService.getJarDetail(currentUserId, jarId);

        // 3. 공통 성공 응답으로 감싸서 반환
        return ApiResponse.of(response);
    }

    // GET /api/v1/jars/{jarId}/members
    // 저금통 멤버 목록 조회 API
    @GetMapping("/{jarId}/members")
    public ApiResponse<JarMemberListResponse> listMembers(
            Authentication authentication,
            @PathVariable Long jarId
    ) {

        // 1. 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스 호출해서 멤버 목록 조회
        JarMemberListResponse response = jarService.listMembers(currentUserId, jarId);

        // 3. 공통 성공 응답으로 감싸서 반환
        return ApiResponse.of(response);
    }

    // POST /api/v1/jars/{jarId}/invites
    // 초대코드 생성 API
    // OWNER / ADMIN 만 생성 가능
    @PostMapping("/{jarId}/invites")
    public ResponseEntity<ApiResponse<JarInviteCreateResponse>> createInvite(
            Authentication authentication,
            @PathVariable Long jarId,
            @Valid @RequestBody JarInviteCreateRequest request
    ) {

        // 1. 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스 호출해서 초대코드 생성
        JarInviteCreateResponse response = jarService.createInvite(currentUserId, jarId, request);

        // 3. 201 Created + 공통 성공 응답 반환
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.of(response));
    }

    // POST /api/v1/jars/invites/join
    // 초대코드로 저금통 참여 API
    // 요청 : code
    // 성공 시 : 어떤 저금통에 들어갔는지, 내 역할이 무엇인지, 언제 들어갔는지
    @PostMapping("/invites/join")
    public ApiResponse<JarInviteJoinResponse> joinByInvite(
            Authentication authentication,
            @Valid @RequestBody JarInviteJoinRequest request
    ) {

        // 1. 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스 호출해서 초대코드 참여 처리
        JarInviteJoinResponse response = jarService.joinByInvite(currentUserId, request);

        // 3. 공통 성공 응답으로 감싸서 반환
        return ApiResponse.of(response);
    }

    // POST /api/v1/jars/{jarId}/leave
    // 저금통 나가기
    @PostMapping("/{jarId}/leave")
    public ApiResponse<JarLeaveResponse> leaveJar(
            Authentication authentication,
            @PathVariable Long jarId
    ) {

        // 1. 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스 호출해서 나가기 처리
        JarLeaveResponse response = jarService.leaveJar(currentUserId, jarId);

        // 3. 공통 성공 응답으로 감싸서 반환
        return ApiResponse.of(response);
    }

    // GET /api/v1/jars/{jarId}/invites
    // 초대코드 목록 조회
    @GetMapping("/{jarId}/invites")
    public ApiResponse<JarInviteListResponse> listInvites(
            Authentication authentication,
            @PathVariable Long jarId
    ) {
        Long currentUserId = extractCurrentUserId(authentication);
        JarInviteListResponse response = jarService.listInvites(currentUserId, jarId);
        return ApiResponse.of(response);
    }

    // POST /api/v1/jars/{jarId}/invites/{inviteId}/revoke
    // 초대코드 폐기
    @PostMapping("/{jarId}/invites/{inviteId}/revoke")
    public ApiResponse<JarInviteRevokeResponse> revokeInvite(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long inviteId
    ) {
        Long currentUserId = extractCurrentUserId(authentication);
        JarInviteRevokeResponse response = jarService.revokeInvite(currentUserId, jarId, inviteId);
        return ApiResponse.of(response);
    }

    // PATCH /api/v1/jars/{jarId}/members/{userId}/role
    // 멤버 역할 변경
    @PatchMapping("/{jarId}/members/{userId}/role")
    public ApiResponse<JarMemberRoleUpdateResponse> updateMemberRole(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long userId,
            @Valid @RequestBody JarMemberRoleUpdateRequest request
    ) {
        Long currentUserId = extractCurrentUserId(authentication);
        JarMemberRoleUpdateResponse response =
                jarService.updateMemberRole(currentUserId, jarId, userId, request);
        return ApiResponse.of(response);
    }

    // POST /api/v1/jars/{jarId}/members/{userId}/kick
    // 멤버 강퇴
    @PostMapping("/{jarId}/members/{userId}/kick")
    public ApiResponse<JarKickResponse> kickMember(
            Authentication authentication,
            @PathVariable Long jarId,
            @PathVariable Long userId
    ) {
        Long currentUserId = extractCurrentUserId(authentication);
        JarKickResponse response = jarService.kickMember(currentUserId, jarId, userId);
        return ApiResponse.of(response);
    }

    // PATCH /api/v1/jars/{jarId}
    // 저금통 기본 설정 수정
    @PatchMapping("/{jarId}")
    public ApiResponse<JarUpdateResponse> updateJar(
            Authentication authentication,
            @PathVariable Long jarId,
            @Valid @RequestBody JarUpdateRequest request
    ) {

        // 1. 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스 호출해서 수정 처리
        JarUpdateResponse response = jarService.updateJar(currentUserId, jarId, request);

        // 3. 공통 성공 응답으로 감싸서 반환
        return ApiResponse.of(response);
    }

    // DELETE /api/v1/jars/{jarId}
    // 저금통 삭제(종료)
    // 응답: 204 No Content
    @DeleteMapping("/{jarId}")
    public ResponseEntity<Void> deleteJar(
            Authentication authentication,
            @PathVariable Long jarId
    ) {

        // 1. 로그인한 사용자 id 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. 서비스 호출해서 삭제 처리
        jarService.deleteJar(currentUserId, jarId);

        // 3. 204 No Content 반환
        return ResponseEntity.noContent().build();
    }

    // 현재 로그인한 사용자 id를 Authentication에서 꺼내는 도우미 메서드
    // 현재 프로젝트의 MeController를 보면 authentication.getPrincipal() 안에 Map 형태로
    // userId, email, name 같은 값이 들어 있는 구조를 사용하고 있음. 그래서 여기서도 같은 방식으로 꺼내면 됀다.
    private Long extractCurrentUserId(Authentication authentication) {

        // 인증 객체 자체가 없으면 로그인 안 된 상태야.
        if (authentication == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "인증이 필요합니다.");
        }

        Object principal = authentication.getPrincipal();

        // 현재 프로젝트 기준:
        // principal 이 Map 이면 그 안에 userId 가 들어 있음
        if (principal instanceof Map<?, ?> map) {
            Object userIdValue = map.get("userId");

            // userId가 Long이면 그대로 반환
            if (userIdValue instanceof Long userId) {
                return userId;
            }

            // userId가 Integer면 Long으로 바꿔서 반환
            if (userIdValue instanceof Integer userId) {
                return userId.longValue();
            }

            // userId가 String이면 숫자로 바꿔서 반환
            if (userIdValue instanceof String userId) {
                try {
                    return Long.parseLong(userId);
                } catch (NumberFormatException e) {
                    throw new ResponseStatusException(UNAUTHORIZED, "userId 형식이 올바르지 않습니다.");
                }
            }
        }

        // 여기까지 왔다는 건 principal 구조가 예상과 다르다는 뜻
        throw new ResponseStatusException(UNAUTHORIZED, "인증 사용자 정보를 읽을 수 없습니다.");
    }
}