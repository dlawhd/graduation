package shop.esjh.memoryjar.service.support;

import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.http.*;
import shop.esjh.memoryjar.config.properties.AppProperties;
import java.time.Duration;

/** 문의 조회 자격을 API 호스트의 HttpOnly 쿠키로만 전달한다. 응답 JSON이나 URL에는 넣지 않는다. */
@Component @RequiredArgsConstructor
public class SupportGuestCookieService {
    public static final String COOKIE = "supportGuest";
    private final AppProperties properties;
    public void write(HttpServletResponse response, SupportGuestService.GuestIssue issue) {
        if (issue.token() == null) return;
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(COOKIE, issue.token())
                .httpOnly(true).secure(properties.getCookie().isSecure()).sameSite("Lax")
                .path("/api/v1/public/support").maxAge(Duration.ofDays(90)).build().toString());
    }
}
