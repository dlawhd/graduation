package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.repository.support.SupportGuestSessionRepository;
import shop.esjh.memoryjar.entity.support.SupportGuestSession;
import java.time.Duration;
import java.time.LocalDateTime;

/** 로그인 도움의 세션 발급/조회만 담당한다. 계정 로그인이나 비밀번호 변경 권한은 주지 않는다. */
@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class SupportGuestService {
    private final SupportGuestSessionRepository sessions;
    private final SupportAccessCrypto crypto;
    private final SupportRateGuard rates;
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public GuestIssue issue(String existingToken, String clientAddress) {
        var existing = find(existingToken);
        if (existing != null) return new GuestIssue(null, existing.getExpiresAt());
        rates.consume("guest-session-global", 1000, Duration.ofHours(1));
        rates.consume("guest-session-ip:" + clientAddress, 60, Duration.ofHours(1));
        String token = crypto.newToken();
        var session = sessions.save(new SupportGuestSession(crypto.hash(token), SupportInquiryPersistenceService.now()));
        return new GuestIssue(token, session.getExpiresAt());
    }
    public SupportActor require(String token) {
        var session = find(token);
        if (session == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인 도움 문의 조회 시간이 지났습니다. 새 문의를 접수해 주세요.");
        return SupportActor.guest(session.getGuestSessionId());
    }
    public GuestStatus status(String token) {
        var s = find(token); return new GuestStatus(s != null, s == null ? null : s.getExpiresAt());
    }
    private SupportGuestSession find(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) return null;
        return sessions.findByTokenHashAndExpiresAtAfter(crypto.hash(token), SupportInquiryPersistenceService.now()).orElse(null);
    }
    public record GuestIssue(String token, LocalDateTime expiresAt) { }
    public record GuestStatus(boolean active, LocalDateTime expiresAt) { }
}
