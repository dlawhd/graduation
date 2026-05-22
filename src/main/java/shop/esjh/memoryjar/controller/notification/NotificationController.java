package shop.esjh.memoryjar.controller.notification;

import shop.esjh.memoryjar.dto.notification.response.NotificationListResponse;
import shop.esjh.memoryjar.dto.notification.response.NotificationReadAllResponse;
import shop.esjh.memoryjar.dto.notification.response.NotificationReadResponse;
import shop.esjh.memoryjar.dto.notification.response.NotificationUnreadCountResponse;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.notification.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    // 내 알림 목록 조회 API
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

    // 안 읽은 알림 개수 조회 API
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<NotificationUnreadCountResponse>> getUnreadCount(
            Authentication authentication
    ) {
        Long currentUserId = extractCurrentUserId(authentication);

        NotificationUnreadCountResponse response =
                notificationService.getUnreadCount(currentUserId);

        return ResponseEntity.ok(ApiResponse.of(response));
    }

    // 알림 1개 읽음 처리 API
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

    // 내 안 읽은 알림 전체 읽음 처리 API
    @PostMapping("/read-all")
    public ResponseEntity<ApiResponse<NotificationReadAllResponse>> markAllAsRead(
            Authentication authentication
    ) {
        Long currentUserId = extractCurrentUserId(authentication);

        NotificationReadAllResponse response =
                notificationService.markAllAsRead(currentUserId);

        return ResponseEntity.ok(ApiResponse.of(response));
    }

    // 현재 로그인한 사용자 번호를 꺼내는 메서드
    // 왜 필요하냐면?
    // 우리 서비스는 "내 알림"만 조회하고 읽음 처리해야 해서 지금 요청한 사람이 누구인지 알아야 함
    private Long extractCurrentUserId(Authentication authentication) {
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인이 필요해요.");
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

        throw new ResponseStatusException(UNAUTHORIZED, "로그인 사용자 정보를 확인할 수 없어요.");
    }

    // Object 값을 Long으로 안전하게 바꾸는 작은 메서드
    private Long convertToLong(Object value) {
        if (value == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인 사용자 번호가 없어요.");
        }

        if (value instanceof Number number) {
            return number.longValue();
        }

        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인 사용자 번호 형식이 올바르지 않아요.");
        }
    }

    // page, size 값이 이상한지 검사하는 메서드
    private void validatePageAndSize(int page, int size) {
        if (page < 0) {
            throw new ResponseStatusException(BAD_REQUEST, "page는 0 이상이어야 해요.");
        }

        if (size < 1 || size > 100) {
            throw new ResponseStatusException(BAD_REQUEST, "size는 1 이상 100 이하여야 해요.");
        }
    }
}
