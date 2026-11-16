package shop.esjh.memoryjar.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import shop.esjh.memoryjar.auth.SocialAccountLink;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.UserService;

import java.util.List;

/** 로그인한 사용자가 연결 목록을 조회하고 새 소셜 인증을 시작하는 API다. */
@RestController
@RequestMapping("/api/v1/me/social-connections")
public class SocialAccountLinkController {
    private final UserService users;

    public SocialAccountLinkController(UserService users) { this.users = users; }

    @GetMapping
    public ResponseEntity<ApiResponse<List<String>>> connections(Authentication auth) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.of(users.connectedOAuthProviders(SocialAccountLink.identity(auth).userId())));
    }

    @PostMapping("/{provider}")
    public ResponseEntity<ApiResponse<Start>> start(Authentication auth, HttpServletRequest request, @PathVariable String provider) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.of(new Start(SocialAccountLink.start(request, SocialAccountLink.identity(auth), provider))));
    }

    public record Start(String path) {}
}
