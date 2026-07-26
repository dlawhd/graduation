package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/*
 * AppProperties 역할
 *
 * application.yml의 app.* 설정값을
 * 자바 코드에서 안전하게 사용할 수 있도록 묶어주는 클래스다.
 *
 * 쉽게 말하면:
 * - 프론트 주소
 * - 쿠키 설정
 * - CORS 허용 주소
 *
 * 같은 공통 설정을 한곳에서 꺼내 쓰게 해준다.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    // OAuth 로그인 성공 후 이동할 프론트 주소
    private String frontendUrl;

    // 쿠키 보안 관련 설정
    private final Cookie cookie = new Cookie();

    // REST와 WebSocket에서 함께 사용할 CORS 설정
    private final Cors cors = new Cors();

    /*
     * Cookie 역할
     *
     * 로그인 쿠키의 Secure, SameSite, Domain 설정을 관리한다.
     */
    @Getter
    @Setter
    public static class Cookie {
        private boolean secure;
        private String sameSite;
        private String domain;
    }

    /*
     * Cors 역할
     *
     * 브라우저 요청을 허용할 프론트 주소 목록을 관리한다.
     *
     * SecurityConfig와 WebSocketConfig가 같은 목록을 사용하므로
     * 두 설정이 서로 달라지는 문제를 막아준다.
     */
    @Getter
    @Setter
    public static class Cors {

        // 정확한 주소와 와일드카드 패턴을 모두 담을 수 있다.
        private List<String> allowedOriginPatterns = new ArrayList<>();
    }
}