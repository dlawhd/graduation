package shop.esjh.memoryjar.controller.note;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.note.request.PlaceSearchRequest;
import shop.esjh.memoryjar.dto.note.response.PlaceSearchItem;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.note.NaverPlaceSearchService;

import java.util.List;
import java.util.Map;

/** 로그인한 사용자의 장소 검색만 서비스로 전달하며 인증정보는 브라우저에 반환하지 않는다. */
@RestController
@RequestMapping("/api/v1/places")
public class PlaceSearchController {
    private final NaverPlaceSearchService service;

    public PlaceSearchController(NaverPlaceSearchService service) { this.service = service; }

    @GetMapping("/search")
    public ResponseEntity<ApiResponse<List<PlaceSearchItem>>> search(Authentication authentication,
            @Valid @ModelAttribute PlaceSearchRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.of(service.search(currentUserId(authentication), request.q())));
    }

    /** 사용자 번호를 요청값으로 받지 않고 기존 JWT 필터가 만든 인증 주체에서 읽는다. */
    private long currentUserId(Authentication authentication) {
        if (authentication != null && authentication.isAuthenticated()
                && authentication.getPrincipal() instanceof Map<?, ?> principal) {
            try {
                long userId = Long.parseLong(String.valueOf(principal.get("userId")));
                if (userId > 0) return userId;
            } catch (NumberFormatException ignored) { }
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
    }
}
