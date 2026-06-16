package shop.esjh.memoryjar.controller;

import org.springframework.util.StringUtils;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.service.AuthCookieService;
import shop.esjh.memoryjar.service.RefreshTokenService;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

// 로그인 이후 토큰을 어떻게 유지하고 끝낼지"를 처리하는 클래스
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final RefreshTokenService refreshTokenService;
    private final AuthCookieService authCookieService;
    private final JwtTokenProvider jwtTokenProvider;

    // ✅ 생성자 주입
    public AuthController(
            RefreshTokenService refreshTokenService,
            AuthCookieService authCookieService,
            JwtTokenProvider jwtTokenProvider
    ) {
        this.refreshTokenService = refreshTokenService;
        this.authCookieService = authCookieService;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    // ✅ POST /api/v1/auth/refresh
    // 출입증(accessToken)이 만료되기 전에 재발급 쿠폰(refreshToken)으로 새 출입증을 다시 받는 API
    @PostMapping("/refresh")
    public ApiResponse<Map<String, Object>> refresh(

            // ✅ 브라우저 쿠키에서 refreshToken 꺼내기
            // required = false : 쿠키가 없어도 일단 메서드 진입은 가능, 대신 아래에서 직접 검사해서 401 처리함
            @CookieValue(name = "refreshToken", required = false) String refreshToken,

            // ✅ 응답 객체
            // 나중에 여기다가 accessToken / refreshToken 쿠키를 다시 심어줌
            HttpServletResponse response
    ) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ResponseStatusException(UNAUTHORIZED, "refreshToken 쿠키가 없음");
        }

        // ✅ refreshToken 회전 결과를 담을 변수
        // rotation 안에는 보통: 어떤 회원(uesr)인지, 새로 발급된 refreshToken 원본(newRefreshRaw)이 들어있음.
        RefreshTokenService.Rotation rotation;
        try {

            // ✅ refreshToken 검증 + 회전(rotation)
            // 1. 쿠키로 받은 refreshToken 원본을 해시로 바꿈
            // 2. DB에서 해당 토큰이 유효한지 확인
            // 3. 기존 refreshToken은 revoked 처리
            // 4. 새 refreshToken 발급
            rotation = refreshTokenService.rotate(refreshToken);
        } catch (IllegalArgumentException e) {

            // ✅ 유효하지 않은 refreshToken이면 401
            throw new ResponseStatusException(UNAUTHORIZED, e.getMessage());
        }

        // ✅ 이 refreshToken의 주인이 누구인지 꺼내기
        // refreshToken이 유효하면 이 토큰은 어떤 회원 것인지 알 수 있음.
        User user = rotation.user();

        // ✅ subject는 userId (너 필터가 subject를 userId로 읽고 있음)
        String subject = String.valueOf(user.getId());

        // ✅ accessToken 안에 넣을 사용자 정보(claims)
        Map<String, Object> claims = new HashMap<>();
        // email은 사용자 정보로 넣는다.
        claims.put("email", user.getEmail());

        // name은 사용자 정보로 넣는다.
        claims.put("name", user.getName());

        // birthyear는 선택값이므로 값이 있을 때만 JWT claims에 넣는다.
        // String.valueOf(null)을 쓰면 "null" 문자열이 들어갈 수 있어서 사용하지 않는다.
        if (StringUtils.hasText(user.getBirthyear())) {
            claims.put("birthyear", user.getBirthyear());
        }

        // ✅ 새 accessToken 발급
        String newAccess = jwtTokenProvider.createAccessToken(subject, claims);

        // ✅ 새 쿠키 저장(새 access + 새 refresh)
        authCookieService.setAccessCookie(response, newAccess);
        authCookieService.setRefreshCookie(response, rotation.newRefreshRaw());

        return ApiResponse.of(Map.of("ok", true));
    }

    // ✅ POST /api/v1/auth/logout
    // refresh 토큰 폐기 + access/refresh 쿠키 삭제 + 세션 종료 + JSESSIONID 삭제
    @PostMapping("/logout")
    public ApiResponse<Map<String, Object>> logout(
            // ✅ 브라우저 쿠키에서 refreshToken 읽기
            @CookieValue(name = "refreshToken", required = false) String refreshToken,

            // ✅ 현재 요청 정보
            // 여기서 세션을 꺼내서 끊을 수 있어요.
            HttpServletRequest request,

            // ✅ 응답 객체
            // 여기다가 쿠키 삭제 명령을 담아요.
            HttpServletResponse response
    ) {
        // 1. refreshToken이 있으면 DB에서 폐기 처리
        refreshTokenService.revokeIfPresent(refreshToken);

        // 2. access / refresh 쿠키 삭제
        authCookieService.clearAccessCookie(response);
        authCookieService.clearRefreshCookie(response);

        // 3. 현재 세션이 있으면 세션도 종료
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }

        // 4. 스프링 시큐리티에 저장된 인증 정보도 비우기
        SecurityContextHolder.clearContext();

        // 5. 세션 쿠키(JSESSIONID)도 삭제
        authCookieService.clearSessionCookie(response);

        return ApiResponse.of(Map.of("ok", true));
    }
}