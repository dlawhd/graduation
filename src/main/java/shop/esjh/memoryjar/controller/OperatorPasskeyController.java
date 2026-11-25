package shop.esjh.memoryjar.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import shop.esjh.memoryjar.auth.TokenCrypto;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.security.AuthRequestLimits;
import shop.esjh.memoryjar.service.AuthCookieService;
import shop.esjh.memoryjar.service.OperatorPasskeyService;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/** 운영자 패스키의 브라우저 요청을 받고, 서명이 확인된 로그인에만 HttpOnly 쿠키를 발급한다. */
@RestController
@RequestMapping("/api/v1/auth/operator-passkey")
public class OperatorPasskeyController {
    private final OperatorPasskeyService passkeys;
    private final JwtTokenProvider jwt;
    private final AuthCookieService cookies;
    private final AuthRequestLimits limits;

    public OperatorPasskeyController(OperatorPasskeyService passkeys, JwtTokenProvider jwt, AuthCookieService cookies,
                                     AuthRequestLimits limits) {
        this.passkeys = passkeys;
        this.jwt = jwt;
        this.cookies = cookies;
        this.limits = limits;
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> status(HttpServletRequest request) {
        return noStore(Map.of("enrollment", passkeys.requiresEnrollment(request)));
    }

    @PostMapping("/options")
    public ResponseEntity<ApiResponse<Map<String, String>>> options(@Valid @RequestBody Options body,
                                                                     HttpServletRequest request) throws IOException {
        limits.accountLookup("operator-passkey", limits.clientAddress(request));
        return noStore(Map.of("options", passkeys.options(request, body.setupCode())));
    }

    @PostMapping("/finish")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> finish(@Valid @RequestBody Finish body,
            HttpServletRequest request, HttpServletResponse response) {
        limits.accountLookup("operator-passkey", limits.clientAddress(request));
        var verified = passkeys.finish(request, body.credential());
        if (verified == null) return noStore(Map.of("authenticated", false));

        var user = verified.user();
        Map<String, Object> claims = new HashMap<>();
        if (user.getEmail() != null) claims.put("email", user.getEmail());
        if (user.getName() != null) claims.put("name", user.getName());
        if (user.getBirthyear() != null) claims.put("birthyear", user.getBirthyear());
        claims.put("sessionVersion", user.getSessionVersion());
        claims.put("loginSessionId", TokenCrypto.sha256Hex(verified.refreshToken()));
        claims.put("operatorPasskeyVerified", true);
        String access = jwt.createAccessToken(Long.toString(user.getId()), claims);
        request.getSession(false).invalidate();
        cookies.clearSessionCookie(response);
        cookies.setAccessCookie(response, access);
        cookies.setRefreshCookie(response, verified.refreshToken());
        return noStore(Map.of("authenticated", true));
    }

    private <T> ResponseEntity<ApiResponse<T>> noStore(T value) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.of(value));
    }

    public record Options(@Size(max = 43) String setupCode) {}
    public record Finish(@NotBlank @Size(max = 16384) String credential) {}
}
