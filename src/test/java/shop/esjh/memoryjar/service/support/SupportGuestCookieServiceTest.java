package shop.esjh.memoryjar.service.support;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import shop.esjh.memoryjar.config.properties.AppProperties;
import java.time.LocalDateTime;
import static org.assertj.core.api.Assertions.*;

/** 로그인 도움 자격은 자바스크립트·URL 대신 제한된 범위의 쿠키로만 전달하는지 검사한다. */
class SupportGuestCookieServiceTest {
    @Test void productionCookieIsSecureHttpOnlyHostOnlyAndLimitedToSupportPath() {
        var properties=new AppProperties();properties.getCookie().setSecure(true);properties.getCookie().setDomain(".example.invalid");
        var response=new MockHttpServletResponse();
        new SupportGuestCookieService(properties).write(response,new SupportGuestService.GuestIssue("test-only-cookie",LocalDateTime.now().plusDays(90)));
        assertThat(response.getHeader("Set-Cookie")).contains("Secure","HttpOnly","SameSite=Lax","Path=/api/v1/public/support","Max-Age=7776000").doesNotContain("Domain=");
    }
    @Test void existingSessionDoesNotExtendCookieLifetime() {
        var response=new MockHttpServletResponse();
        new SupportGuestCookieService(new AppProperties()).write(response,new SupportGuestService.GuestIssue(null,LocalDateTime.now().plusDays(1)));
        assertThat(response.getHeader("Set-Cookie")).isNull();
    }
}
