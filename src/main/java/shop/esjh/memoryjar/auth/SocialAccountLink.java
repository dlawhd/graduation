package shop.esjh.memoryjar.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import java.io.Serializable;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** 기존 Memory Jar 로그인으로 시작한 소셜 연결을 만료되는 1회용 OAuth 요청에 묶는다. */
public final class SocialAccountLink {
    private static final String KEY = SocialAccountLink.class.getName();
    private static final String PREFIX = "link.";
    private static final Set<String> PROVIDERS = Set.of("naver", "google", "kakao");

    private SocialAccountLink() {}

    public static Identity identity(Authentication auth) {
        if (auth != null && auth.getPrincipal() instanceof Map<?, ?> claims
                && claims.get("userId") instanceof String user
                && claims.get("sessionVersion") instanceof Number version
                && claims.get("loginSessionId") instanceof String session
                && !session.isBlank() && session.length() <= 64) {
            return new Identity(Long.parseLong(user), version.longValue(), session);
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "다시 로그인한 뒤 연결해 주세요.");
    }

    /** 인증된 POST만 시작 번호를 발급한다. 소셜 공급자 이름을 주소에 넣기 전에 확인한다. */
    public static String start(HttpServletRequest request, Identity identity, String provider) {
        if (!PROVIDERS.contains(provider)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지원하지 않는 로그인 방식입니다.");
        String nonce = UUID.randomUUID().toString();
        HttpSession session = request.getSession();
        synchronized (org.springframework.web.util.WebUtils.getSessionMutex(session)) {
            session.setAttribute(KEY, new Attempt(identity, provider, nonce, null, Instant.now().plusSeconds(300)));
        }
        return "/oauth2/authorization/" + provider + "?link=" + nonce;
    }

    /** Spring이 만든 무작위 state를 유지하면서 연결 완료가 일반 로그인으로 처리되지 않게 표시한다. */
    public static String bind(HttpServletRequest request, String provider, String state, String nonce) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            synchronized (org.springframework.web.util.WebUtils.getSessionMutex(session)) {
                if (session.getAttribute(KEY) instanceof Attempt a && a.expiresAt().isAfter(Instant.now())
                        && a.state() == null && a.provider().equals(provider) && a.nonce().equals(nonce)) {
                    String bound = PREFIX + state;
                    session.setAttribute(KEY, new Attempt(a.identity(), provider, nonce, bound, a.expiresAt()));
                    return bound;
                }
            }
        }
        throw new IllegalArgumentException("소셜 연결 요청이 만료되었습니다.");
    }

    public static boolean isLink(String state) { return state != null && state.startsWith(PREFIX); }

    /** Spring이 콜백 state를 검증한 후에만 호출한다. 같은 요청은 한 번만 소비한다. */
    public static Identity consume(HttpServletRequest request, String provider, String state) {
        HttpSession session = request.getSession(false);
        if (session == null || !isLink(state)) return null;
        synchronized (org.springframework.web.util.WebUtils.getSessionMutex(session)) {
            if (session.getAttribute(KEY) instanceof Attempt a
                    && state.equals(a.state()) && a.provider().equals(provider)) {
                session.removeAttribute(KEY);
                if (a.expiresAt().isAfter(Instant.now())) return a.identity();
            }
            return null;
        }
    }

    public record Identity(long userId, long version, String sessionId) implements Serializable {}
    private record Attempt(Identity identity, String provider, String nonce, String state, Instant expiresAt) implements Serializable {}
}
