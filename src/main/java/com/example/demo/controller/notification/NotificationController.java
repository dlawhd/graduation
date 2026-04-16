package com.example.demo.controller.notification;

import com.example.demo.dto.notification.response.NotificationListResponse;
import com.example.demo.dto.notification.response.NotificationReadAllResponse;
import com.example.demo.dto.notification.response.NotificationReadResponse;
import com.example.demo.dto.notification.response.NotificationUnreadCountResponse;
import com.example.demo.dto.response.ApiResponse;
import com.example.demo.service.notification.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/*
 * 이 컨트롤러는 "알림 API 입구" 역할을 해.
 *
 * 쉽게 말하면:
 * - 프론트가 내 알림 목록을 달라고 요청하면 전달해주고
 * - 안 읽은 개수를 달라고 하면 전달해주고
 * - 읽음 처리 요청이 오면 서비스에 넘겨주는
 * 알림 기능의 문 같은 역할이야.
 */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    /*
     * 내 알림 목록 조회 API
     *
     * GET /api/v1/notifications?page=0&size=10
     *
     * page:
     * - 몇 번째 페이지를 볼지
     *
     * size:
     * - 한 번에 몇 개를 가져올지
     */
    @GetMapping
    public ResponseEntity<ApiResponse<NotificationListResponse>> getMyNotifications(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        Long currentUserId = extractCurrentUserId(authentication);

        validatePageAndSize(page, size);

        NotificationListResponse response =
                notificationService.getMyNotifications(currentUserId, page, size);

        return ResponseEntity.ok(ApiResponse.of(response));
    }

    /*
     * 안 읽은 알림 개수 조회 API
     *
     * GET /api/v1/notifications/unread-count
     *
     * 헤더 종 아이콘 옆 빨간 숫자 뱃지에 사용할 수 있어.
     */
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<NotificationUnreadCountResponse>> getUnreadCount(
            Authentication authentication
    ) {
        Long currentUserId = extractCurrentUserId(authentication);

        NotificationUnreadCountResponse response =
                notificationService.getUnreadCount(currentUserId);

        return ResponseEntity.ok(ApiResponse.of(response));
    }

    /*
     * 알림 1개 읽음 처리 API
     *
     * POST /api/v1/notifications/{notificationId}/read
     *
     * 사용자가 알림을 눌렀을 때 호출하면 돼.
     */
    @PostMapping("/{notificationId}/read")
    public ResponseEntity<ApiResponse<NotificationReadResponse>> markAsRead(
            Authentication authentication,
            @PathVariable Long notificationId
    ) {
        Long currentUserId = extractCurrentUserId(authentication);

        NotificationReadResponse response =
                notificationService.markAsRead(currentUserId, notificationId);

        return ResponseEntity.ok(ApiResponse.of(response));
    }

    /*
     * 내 안 읽은 알림 전체 읽음 처리 API
     *
     * POST /api/v1/notifications/read-all
     *
     * "모두 읽음" 버튼을 눌렀을 때 호출하면 돼.
     */
    @PostMapping("/read-all")
    public ResponseEntity<ApiResponse<NotificationReadAllResponse>> markAllAsRead(
            Authentication authentication
    ) {
        Long currentUserId = extractCurrentUserId(authentication);

        NotificationReadAllResponse response =
                notificationService.markAllAsRead(currentUserId);

        return ResponseEntity.ok(ApiResponse.of(response));
    }

    /*
     * 현재 로그인한 사용자 번호를 꺼내는 메서드
     *
     * 왜 필요하냐면?
     * 우리 서비스는 "내 알림"만 조회하고 읽음 처리해야 해서
     * 지금 요청한 사람이 누구인지 알아야 해.
     *
     * 현재 프로젝트에서는 principal 안에 userId가 들어있는 구조를 많이 사용하니까
     * 그 형태를 기준으로 꺼내도록 만들었어.
     */
    private Long extractCurrentUserId(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인이 필요해.");
        }

        Object principal = authentication.getPrincipal();

        // principal이 Map 형태일 때
        // 예: {userId=1}
        if (principal instanceof Map<?, ?> principalMap) {
            Object userIdValue = principalMap.get("userId");
            return convertToLong(userIdValue);
        }

        // principal 자체가 숫자일 수도 있으니 한 번 더 대비
        if (principal instanceof Number number) {
            return number.longValue();
        }

        throw new ResponseStatusException(UNAUTHORIZED, "로그인 사용자 정보를 확인할 수 없어.");
    }

    /*
     * Object 값을 Long으로 안전하게 바꾸는 작은 메서드
     */
    private Long convertToLong(Object value) {
        if (value == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인 사용자 번호가 없어.");
        }

        if (value instanceof Number number) {
            return number.longValue();
        }

        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인 사용자 번호 형식이 올바르지 않아.");
        }
    }

    /*
     * page, size 값이 이상한지 검사하는 메서드
     *
     * page는 0 이상
     * size는 1 이상
     *
     * 너무 큰 size는 서버에 부담이 될 수 있어서
     * v1에서는 100까지만 허용했어.
     */
    private void validatePageAndSize(int page, int size) {
        if (page < 0) {
            throw new ResponseStatusException(BAD_REQUEST, "page는 0 이상이어야 해.");
        }

        if (size < 1 || size > 100) {
            throw new ResponseStatusException(BAD_REQUEST, "size는 1 이상 100 이하여야 해.");
        }
    }
}