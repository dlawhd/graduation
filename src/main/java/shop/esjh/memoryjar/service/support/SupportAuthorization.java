package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.core.Authentication;
import shop.esjh.memoryjar.config.properties.SupportProperties;
import shop.esjh.memoryjar.repository.UserRepository;
import java.util.Map;

/** 로그인 주체와 운영자 허용 목록을 검사한다. JarRole.ADMIN은 이 검사에 사용하지 않는다. */
@Service
@RequiredArgsConstructor
public class SupportAuthorization {
    private final SupportProperties properties;
    private final UserRepository users;

    public boolean isOperator(Long userId) {
        return userId != null && properties.getOperatorUserIds().contains(userId) && users.existsById(userId);
    }

    /** UI 노출 여부와 무관하게 운영자 API의 모든 진입점에서 호출한다. */
    public void requireOperator(Long userId) {
        if (!isOperator(userId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "운영자만 이용할 수 있습니다.");
    }

    public static Long currentUserId(Authentication authentication) {
        if (authentication != null && authentication.isAuthenticated()
                && authentication.getPrincipal() instanceof Map<?, ?> principal
                && principal.get("userId") != null) {
            try {
                long id = Long.parseLong(String.valueOf(principal.get("userId")));
                if (id > 0) return id;
            } catch (NumberFormatException ignored) { }
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
    }
}
