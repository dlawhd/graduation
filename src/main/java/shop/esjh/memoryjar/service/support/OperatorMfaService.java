package shop.esjh.memoryjar.service.support;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.entity.support.*;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.support.*;
import shop.esjh.memoryjar.security.*;

/** 운영자 등록·인증·복구를 처리한다. 모든 변경은 사용자 잠금으로 직렬화하고 인증은 현재 로그인에만 부여한다. */
@Service
@RequiredArgsConstructor
@Transactional(isolation = Isolation.READ_COMMITTED)
public class OperatorMfaService {
    private final SupportAuthorization authorization;
    private final UserRepository users;
    private final OperatorMfaCredentialRepository credentials;
    private final OperatorMfaProofRepository proofs;
    private final OperatorMfaCrypto crypto;
    private final SupportAccessCrypto hashes;
    private final RequestBudgetService budgets;

    public record State(boolean configured, boolean enrolled, boolean bootstrapAvailable, Instant verifiedUntil) {}
    public record Enrollment(String secret, String issuer, String account, Instant expiresAt) {}
    public record Result(Instant verifiedUntil, List<String> recoveryCodes) {}
    private record Identity(Long userId, long version, String sessionId, String sessionKey) {}

    @Transactional(readOnly = true)
    public State status(Authentication auth) {
        Identity identity = identity(auth);
        boolean enrolled = credentials.findById(identity.userId()).map(c -> c.getEnabledAt() != null).orElse(false);
        return new State(crypto.configured(), enrolled, crypto.bootstrapConfigured(),
                crypto.configured() && enrolled ? validProof(identity).map(p -> p.getExpiresAt().toInstant(ZoneOffset.UTC)).orElse(null) : null);
    }

    /** 최초 등록에는 서버 소유자가 별도 전달한 난수도 요구한다. 탈취한 로그인만으로 인증 앱을 선점하지 못하게 한다. */
    public Enrollment enroll(Authentication auth, String bootstrap) {
        Identity identity = identity(auth);
        limit(identity, "enroll", 5);
        crypto.requireConfigured();
        if (!crypto.matchesBootstrap(bootstrap)) throw invalidCode();
        lockUser(identity);
        var credential = credentials.findById(identity.userId()).orElseGet(() -> new OperatorMfaCredential(identity.userId()));
        if (credential.getEnabledAt() != null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 인증 앱이 등록돼 있습니다. 인증 번호나 복구 코드를 사용해 주세요.");
        String secret = crypto.newSecret();
        var until = now().plusMinutes(5);
        credential.prepare(crypto.encrypt(identity.userId(), secret), identity.sessionKey(), until);
        credentials.save(credential);
        return new Enrollment(secret, "Memory Jar", "operator-" + identity.userId(), until.toInstant(ZoneOffset.UTC));
    }

    /** 등록용 번호를 확인한 시점에만 키를 활성화한다. 복구 원문은 이 응답에서 한 번만 전달한다. */
    public Result confirm(Authentication auth, String code) {
        Identity identity = identity(auth);
        limit(identity, "verify", 10);
        crypto.requireConfigured();
        lockUser(identity);
        var credential = credentials.findById(identity.userId()).orElseThrow(this::invalidCode);
        if (credential.getEnabledAt() != null || !identity.sessionKey().equals(credential.getPendingSessionKey())
                || credential.getPendingExpiresAt() == null || !credential.getPendingExpiresAt().isAfter(now())) throw invalidCode();
        long step = crypto.matchingStep(crypto.decrypt(identity.userId(), credential.getPendingSecret()), code, Instant.now(), -1);
        if (step < 0) throw invalidCode();
        var recovery = crypto.newRecoveryCodes();
        credential.enable(step, recoveryHashes(identity.userId(), recovery), now());
        return new Result(grant(identity), recovery);
    }

    /** 행 잠금 안에서 사용한 시간 구간 또는 복구 해시를 소모하므로 동시 재전송도 한 번만 성공한다. */
    public Result verify(Authentication auth, String code, boolean recovery) {
        Identity identity = identity(auth);
        limit(identity, "verify", 10);
        crypto.requireConfigured();
        lockUser(identity);
        var credential = enabled(identity);
        consume(identity, credential, code, recovery);
        return new Result(grant(identity), List.of());
    }

    /** 복구 목록을 잃었을 때 새 인증 앱 번호로 교체한다. 이전 복구 코드는 즉시 모두 무효화한다. */
    public Result regenerateRecovery(Authentication auth, String code) {
        Identity identity = identity(auth);
        limit(identity, "verify", 10);
        crypto.requireConfigured();
        lockUser(identity);
        var credential = enabled(identity);
        consume(identity, credential, code, false);
        var recovery = crypto.newRecoveryCodes();
        credential.replaceRecoveryHashes(recoveryHashes(identity.userId(), recovery));
        return new Result(grant(identity), recovery);
    }

    public void lock(Authentication auth) {
        Identity identity = identity(auth);
        lockUser(identity);
        proofs.deleteSession(identity.sessionKey());
    }

    /** REST 진입점은 매번 운영자 허용 목록과 기기별 만료를 검사한다. 설정 누락도 우회 허용하지 않는다. */
    @Transactional(readOnly = true)
    public void requireVerified(Authentication auth) {
        Identity identity = identity(auth);
        if (!crypto.configured() || validProof(identity).isEmpty()) throw new OperatorMfaRequiredException();
    }

    private void consume(Identity identity, OperatorMfaCredential credential, String code, boolean recovery) {
        if (recovery) {
            String normalized = code == null ? "" : code.strip().toLowerCase(Locale.ROOT);
            if (!normalized.matches("[a-f0-9]{32}")) throw invalidCode();
            String candidate = recoveryHash(identity.userId(), normalized);
            var remaining = new ArrayList<>(List.of(credential.getRecoveryHashes().split("\\n")));
            boolean removed = remaining.removeIf(hash -> MessageDigest.isEqual(hash.getBytes(StandardCharsets.US_ASCII),
                    candidate.getBytes(StandardCharsets.US_ASCII)));
            if (!removed) throw invalidCode();
            credential.replaceRecoveryHashes(String.join("\n", remaining));
        } else {
            long step = crypto.matchingStep(crypto.decrypt(identity.userId(), credential.getEncryptedSecret()), code,
                    Instant.now(), credential.getLastUsedStep());
            if (step < 0) throw invalidCode();
            credential.consumeStep(step);
        }
    }

    private OperatorMfaCredential enabled(Identity identity) {
        return credentials.findById(identity.userId()).filter(c -> c.getEnabledAt() != null).orElseThrow(this::invalidCode);
    }
    private Optional<OperatorMfaProof> validProof(Identity identity) {
        return proofs.findEnabledProof(identity.sessionKey()).filter(p -> p.getUserId().equals(identity.userId())
                && p.getSessionVersion() == identity.version() && p.getExpiresAt().isAfter(now()));
    }
    private Instant grant(Identity identity) {
        LocalDateTime until = now().plusMinutes(15);
        proofs.grant(identity.sessionKey(), identity.userId(), identity.version(), until);
        return until.toInstant(ZoneOffset.UTC);
    }
    private void lockUser(Identity identity) {
        users.findByIdForUpdate(identity.userId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
        // 로그아웃이나 비밀번호 변경이 사용자 잠금을 먼저 얻었을 때도 과거 요청에 추가 인증을 발급하지 않는다.
        currentSession(identity);
    }
    private Identity identity(Authentication auth) {
        Long id = SupportAuthorization.currentUserId(auth);
        authorization.requireOperator(id);
        if (!(auth.getPrincipal() instanceof Map<?, ?> principal)
                || !(principal.get("sessionVersion") instanceof Number version)
                || !(principal.get("loginSessionId") instanceof String sessionId)
                || sessionId.isBlank() || sessionId.length() > 64)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "추가 인증을 사용하려면 다시 로그인해 주세요.");
        var result = new Identity(id, version.longValue(), sessionId, hashes.privateKey("OPERATOR_MFA_SESSION_V1|" + sessionId));
        currentSession(result);
        return result;
    }
    private void currentSession(Identity identity) {
        if (users.countCurrentSession(identity.userId(), identity.version(), identity.sessionId(),
                LocalDateTime.now(ZoneId.of("Asia/Seoul"))) != 1L)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
    }
    private void limit(Identity identity, String purpose, int maximum) {
        budgets.consume(new RequestBudgetService.Rule("operator-mfa:" + identity.userId() + ":" + purpose,
                maximum, Duration.ofMinutes(15)));
    }
    private String recoveryHash(Long id, String code) { return hashes.privateKey("OPERATOR_MFA_RECOVERY_V1|" + id + "|" + code); }
    private String recoveryHashes(Long id, List<String> codes) { return String.join("\n", codes.stream().map(code -> recoveryHash(id, code)).toList()); }
    private ResponseStatusException invalidCode() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "コードが正しくないか、期限切れ・使用済みです。認証アプリの次の番号をお試しください。");
    }
    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }

    @Scheduled(scheduler = "securityCleanupTaskScheduler", fixedDelay = 60000, initialDelay = 60000)
    public void cleanup() { proofs.deleteExpiredBatch(now()); }
}
