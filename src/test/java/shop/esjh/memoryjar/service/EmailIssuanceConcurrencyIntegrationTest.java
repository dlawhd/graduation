package shop.esjh.memoryjar.service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.auth.EmailVerificationCrypto;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.enums.auth.EmailVerificationPurpose;
import shop.esjh.memoryjar.repository.EmailVerificationRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 실제 MariaDB에서 최초 발급 경쟁·목적 분리·실패 롤백을 확인한다. 이메일은 발송하지 않는다. */
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class, EmailVerificationService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class EmailIssuanceConcurrencyIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired EmailVerificationService service;
    @Autowired EmailVerificationRepository verifications;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean EmailVerificationCrypto crypto;

    static Stream<Arguments> purposesAndIsolation() {
        return Stream.of(EmailVerificationPurpose.values()).flatMap(purpose -> Stream.of(
                Arguments.of(purpose, TransactionDefinition.ISOLATION_REPEATABLE_READ),
                Arguments.of(purpose, TransactionDefinition.ISOLATION_READ_COMMITTED)));
    }

    @ParameterizedTest
    @MethodSource("purposesAndIsolation")
    void firstRequestsProduceOneCodeAndOneCooldownInsteadOfDatabaseError(EmailVerificationPurpose purpose,
                                                                       int isolation) throws Exception {
        String email = UUID.randomUUID() + "@example.com";
        when(crypto.hashCode(eq(email), eq(purpose), anyString())).thenReturn("a".repeat(64));
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Integer> issue = () -> {
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("동시 요청 준비 시간 초과");
                var tx = new TransactionTemplate(transactions);
                tx.setIsolationLevel(isolation);
                try {
                    tx.executeWithoutResult(status -> issue(purpose, email.toUpperCase()));
                    return 200;
                } catch (ResponseStatusException e) { return e.getStatusCode().value(); }
            };
            var first = pool.submit(issue); var second = pool.submit(issue); start.countDown();
            assertThat(java.util.List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 429);
            var stored = verifications.findByEmailAndPurpose(email, purpose).orElseThrow();
            assertThat(stored.getCodeHash()).isEqualTo("a".repeat(64));
            assertThat(stored.getCodeExpiresAt()).isAfter(LocalDateTime.now(ZoneId.of("Asia/Seoul")));
            verify(crypto, times(1)).hashCode(eq(email), eq(purpose), anyString());
        } finally { start.countDown(); pool.shutdownNow(); }
    }

    @Test
    void failedHashRollsBackPreparedRowAndNextRequestCanIssueNormally() {
        String email = UUID.randomUUID() + "@example.com";
        when(crypto.hashCode(eq(email), any(), anyString())).thenThrow(new IllegalStateException("시험 실패"));
        assertThatThrownBy(() -> service.issueSignupCode(email)).isInstanceOf(IllegalStateException.class);
        assertThat(verifications.findByEmailAndPurpose(email, EmailVerificationPurpose.SIGNUP)).isEmpty();
        doReturn("b".repeat(64)).when(crypto).hashCode(eq(email), any(), anyString());
        service.issueSignupCode(email);
        service.issuePasswordResetCode(email);
        assertThat(verifications.findByEmailAndPurpose(email, EmailVerificationPurpose.SIGNUP)).isPresent();
        assertThat(verifications.findByEmailAndPurpose(email, EmailVerificationPurpose.PASSWORD_RESET)).isPresent();
    }

    /** 세 가지 발급 목적이 모두 동일한 DB 보호 경로를 사용하는지 실제 공개 메서드로 검사한다. */
    private void issue(EmailVerificationPurpose purpose, String email) {
        switch (purpose) {
            case SIGNUP -> service.issueSignupCode(email);
            case PASSWORD_RESET -> service.issuePasswordResetCode(email);
            case LOGIN_ID_RECOVERY -> service.issueLoginIdRecoveryCode(email);
        }
    }
}
