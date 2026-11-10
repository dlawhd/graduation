package shop.esjh.memoryjar.security;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.SupportProperties;
import shop.esjh.memoryjar.entity.RefreshToken;
import shop.esjh.memoryjar.repository.*;
import shop.esjh.memoryjar.repository.support.*;
import shop.esjh.memoryjar.service.support.*;
import static org.assertj.core.api.Assertions.*;

/** 실제 임시 MariaDB에서 최초 등록 경쟁·번호 재사용·기기 격리·로그아웃·만료를 검증한다. 운영 데이터는 사용하지 않는다. */
@DataJpaTest(showSql = false, properties = {
    "app.auth.email-verification-secret=local-test-only-mfa-request-budget-secret",
    "app.support.mfa.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "app.support.mfa.bootstrap-secret=test-only-operator-bootstrap-code-at-least-32"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({OperatorMfaService.class, OperatorMfaCrypto.class, SupportAuthorization.class,
    SupportProperties.class, SupportAccessCrypto.class, RequestBudgetService.class,
    shop.esjh.memoryjar.config.SchedulerConfig.class, shop.esjh.memoryjar.config.JpaAuditConfig.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class OperatorMfaIntegrationTest extends AbstractMariaDbRepositoryTest {
    private static final String BOOTSTRAP = "test-only-operator-bootstrap-code-at-least-32";
    @Autowired OperatorMfaService service;
    @Autowired OperatorMfaCrypto crypto;
    @Autowired SupportProperties operators;
    @Autowired PlatformTransactionManager transactions;
    @Autowired RefreshTokenRepository tokens;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    Long userId;
    String firstSession, secondSession;
    Authentication first, second;

    @BeforeEach void fixture() {
        jdbc.update("DELETE FROM security_request_limits");
        userId = new TransactionTemplate(transactions).execute(tx -> {
            String unique = UUID.randomUUID().toString();
            return saveUser(unique, unique + "@example.invalid", "보안 시험 계정").getId();
        });
        operators.setOperatorUserIds(Set.of(userId));
        firstSession = UUID.randomUUID().toString(); secondSession = UUID.randomUUID().toString();
        addSession(firstSession); addSession(secondSession);
        first = auth(firstSession, 0); second = auth(secondSession, 0);
    }
    @AfterEach void removeOwnFixture() {
        if (userId == null) return;
        jdbc.update("DELETE FROM operator_mfa_proofs WHERE user_id=?", userId);
        jdbc.update("DELETE FROM operator_mfa_credentials WHERE user_id=?", userId);
        jdbc.update("DELETE FROM refresh_tokens WHERE user_id=?", userId);
        jdbc.update("DELETE FROM users WHERE id=?", userId);
        operators.setOperatorUserIds(Set.of());
    }
    private void addSession(String session) {
        new TransactionTemplate(transactions).executeWithoutResult(tx -> tokens.saveAndFlush(RefreshToken.builder()
            .user(users.findById(userId).orElseThrow()).sessionId(session).tokenHash(UUID.randomUUID().toString().replace("-", "").repeat(2))
            .expiresAt(LocalDateTime.now(ZoneId.of("Asia/Seoul")).plusDays(1)).build()));
    }
    private Authentication auth(String session, long version) {
        return new UsernamePasswordAuthenticationToken(Map.of("userId", userId.toString(), "sessionVersion", version,
            "loginSessionId", session), null, List.of());
    }
    private String code(String secret, int offset) { return crypto.totp(secret, Instant.now().getEpochSecond() / 30 + offset); }
    private OperatorMfaService.Result enable() {
        var enrollment = service.enroll(first, BOOTSTRAP);
        return service.confirm(first, code(enrollment.secret(), 0));
    }
    private void rejected(int status, org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ResponseStatusException.class,
            error -> assertThat(error.getStatusCode().value()).isEqualTo(status));
    }

    @Test void registrationRequiresBootstrapAndConfirmationAndStoresNoPlaintextSecrets() {
        rejected(403, () -> service.requireVerified(first));
        rejected(400, () -> service.enroll(first, "wrong"));
        var enrollment = service.enroll(first, BOOTSTRAP);
        rejected(403, () -> service.requireVerified(first));
        rejected(400, () -> service.confirm(second, code(enrollment.secret(), 0)));
        var confirmed = service.confirm(first, code(enrollment.secret(), 0));
        assertThat(confirmed.recoveryCodes()).hasSize(10);
        service.requireVerified(first);
        rejected(403, () -> service.requireVerified(second));
        String ciphertext = jdbc.queryForObject("SELECT encrypted_secret FROM operator_mfa_credentials WHERE user_id=?", String.class, userId);
        String recoveryHashes = jdbc.queryForObject("SELECT recovery_hashes FROM operator_mfa_credentials WHERE user_id=?", String.class, userId);
        assertThat(ciphertext).doesNotContain(enrollment.secret());
        confirmed.recoveryCodes().forEach(code -> assertThat(recoveryHashes).doesNotContain(code));
        assertThat(service.status(first).verifiedUntil()).isAfter(Instant.now());
        rejected(409, () -> service.enroll(first, BOOTSTRAP));
    }
    @Test void enrollmentExpiresAndCannotBeConfirmedAgain() {
        var enrollment = service.enroll(first, BOOTSTRAP);
        jdbc.update("UPDATE operator_mfa_credentials SET pending_expires_at=? WHERE user_id=?", LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1), userId);
        rejected(400, () -> service.confirm(first, code(enrollment.secret(), 0)));
        var next = service.enroll(first, BOOTSTRAP);
        service.confirm(first, code(next.secret(), 0));
        rejected(400, () -> service.confirm(first, code(next.secret(), 0)));
        rejected(400, () -> service.verify(second, code(next.secret(), 0), false));
    }
    @Test void sameRecoveryCodeOnlySucceedsOnceEvenAcrossConcurrentSessions() throws Exception {
        var result = enable(); var pool = Executors.newFixedThreadPool(2); var start = new CountDownLatch(1);
        try {
            var attempts = new ArrayList<Future<Integer>>();
            for (var auth : List.of(first, second)) attempts.add(pool.submit(() -> {
                start.await();
                try { service.verify(auth, result.recoveryCodes().get(0), true); return 200; }
                catch (ResponseStatusException e) { return e.getStatusCode().value(); }
            }));
            start.countDown();
            assertThat(List.of(attempts.get(0).get(20, TimeUnit.SECONDS), attempts.get(1).get(20, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200, 400);
        } finally { start.countDown(); pool.shutdownNow(); }
    }
    @Test void proofsExpireLockAndDoNotSurviveRevokedLoginOrSessionVersionChange() {
        var result = enable(); service.lock(first); rejected(403, () -> service.requireVerified(first));
        service.verify(first, result.recoveryCodes().get(0), true);
        jdbc.update("UPDATE operator_mfa_proofs SET expires_at=? WHERE user_id=?", LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1), userId);
        rejected(403, () -> service.requireVerified(first));
        service.verify(first, result.recoveryCodes().get(1), true);
        jdbc.update("UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND session_id=?", LocalDateTime.now(), userId, firstSession);
        rejected(401, () -> service.requireVerified(first));
        service.verify(second, result.recoveryCodes().get(2), true);
        jdbc.update("UPDATE users SET session_version=session_version+1 WHERE id=?", userId);
        rejected(401, () -> service.requireVerified(second));
    }
    @Test void ordinaryAccountsAndLegacyTokensCannotEnrollOrRead() {
        operators.setOperatorUserIds(Set.of()); rejected(403, () -> service.status(first));
        operators.setOperatorUserIds(Set.of(userId));
        var legacy = new UsernamePasswordAuthenticationToken(Map.of("userId", userId.toString(), "sessionVersion", 0L), null, List.of());
        rejected(403, () -> service.status(legacy));
        rejected(401, () -> service.status(null));
    }
    @Test void invalidAttemptsRemainLimitedAfterTransactionRollback() {
        enable();
        for (int i = 0; i < 9; i++) rejected(400, () -> service.verify(second, "00000000000000000000000000000000", true));
        rejected(429, () -> service.verify(second, "00000000000000000000000000000000", true));
    }
    @Test void recoveryRegenerationInvalidatesOldCodesAndCleanupOnlyRemovesExpiredProofs() {
        var enrollment = service.enroll(first, BOOTSTRAP);
        var initial = service.confirm(first, code(enrollment.secret(), 0));
        var next = service.regenerateRecovery(first, code(enrollment.secret(), 1));
        rejected(400, () -> service.verify(second, initial.recoveryCodes().get(0), true));
        service.verify(second, next.recoveryCodes().get(0), true);
        jdbc.update("UPDATE operator_mfa_proofs SET expires_at=? WHERE session_key IN (SELECT key_value FROM (SELECT session_key key_value FROM operator_mfa_proofs WHERE user_id=? LIMIT 1) t)",
            LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1), userId);
        service.cleanup();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM operator_mfa_proofs WHERE user_id=?", Integer.class, userId)).isEqualTo(1);
    }
}
