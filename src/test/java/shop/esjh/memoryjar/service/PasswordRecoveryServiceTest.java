package shop.esjh.memoryjar.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.*;

/** 복구 요청의 공개 응답과 실제 메일 발송 조건을 따로 확인한다. */
class PasswordRecoveryServiceTest {
    private final LocalAuthService local = mock(LocalAuthService.class);
    private final EmailVerificationDispatchService dispatch = mock(EmailVerificationDispatchService.class);
    private final EmailVerificationService verification = mock(EmailVerificationService.class);
    private final PasswordRecoveryService recovery = new PasswordRecoveryService(local, dispatch, verification);

    @AfterEach
    void stopWorker() {
        recovery.stopMailWorker();
    }

    @Test
    void acceptsBothRequestsAndOnlyMailsMatchingAccount() throws InterruptedException {
        var entered = new CountDownLatch(2);
        when(local.verifyPasswordResetIdentity("registered", "owner@example.com"))
                .thenAnswer(invocation -> {
                    entered.countDown();
                    return new LocalAuthService.PasswordResetIdentity("registered", "owner@example.com", 1L);
                });
        when(local.verifyPasswordResetIdentity("missing", "owner@example.com"))
                .thenAnswer(invocation -> {
                    entered.countDown();
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "no account");
                });

        var registered = recovery.requestCode("registered", "Owner@example.com");
        var missing = recovery.requestCode("missing", "Owner@example.com");

        assertThat(registered.email()).isEqualTo(missing.email());
        assertThat(java.time.Duration.between(registered.expiresAt(), missing.expiresAt()).abs()).isLessThan(java.time.Duration.ofSeconds(2));
        assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
        verify(dispatch, timeout(3000).times(1)).sendPasswordResetVerificationCode("owner@example.com");
    }

    @Test
    void missingAccountAndRejectedCodeSharePublicError() {
        when(local.verifyPasswordResetIdentity("registered", "owner@example.com"))
                .thenReturn(new LocalAuthService.PasswordResetIdentity("registered", "owner@example.com", 1L));
        when(local.verifyPasswordResetIdentity("missing", "owner@example.com"))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "no account"));
        when(verification.verifyPasswordResetCode("owner@example.com", "111111"))
                .thenThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "attempt limit"));

        var missing = catchThrowableOfType(ResponseStatusException.class,
                () -> recovery.confirmCode("missing", "owner@example.com", "111111"));
        var rejected = catchThrowableOfType(ResponseStatusException.class,
                () -> recovery.confirmCode("registered", "owner@example.com", "111111"));
        assertThat(missing.getStatusCode()).isEqualTo(rejected.getStatusCode());
        assertThat(missing.getReason()).isEqualTo(rejected.getReason());
    }
}
