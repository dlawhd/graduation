package shop.esjh.memoryjar.service;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.auth.response.EmailVerificationSendResponse;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** 비밀번호 복구 요청을 접수하고, 계정 존재 여부와 무관하게 같은 공개 응답을 반환한다. */
@Service
public class PasswordRecoveryService {
    private static final Logger log = LoggerFactory.getLogger(PasswordRecoveryService.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final LocalAuthService localAuth;
    private final EmailVerificationDispatchService dispatch;
    private final EmailVerificationService verification;
    // 메일 응답 시간으로 계정을 구분할 수 없도록 계정 조회와 발송을 둘 다 작업 큐 안에서 한다.
    private final ThreadPoolExecutor mailWorker = new ThreadPoolExecutor(
            2, 2, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(8),
            task -> new Thread(task, "password-recovery-mail"));

    public PasswordRecoveryService(LocalAuthService localAuth, EmailVerificationDispatchService dispatch,
            EmailVerificationService verification) {
        this.localAuth = localAuth;
        this.dispatch = dispatch;
        this.verification = verification;
    }

    /** 같은 형식의 요청은 모두 접수하고, 가입 이메일과 아이디가 일치할 때만 메일을 발송한다. */
    public EmailVerificationSendResponse requestCode(String loginId, String email) {
        String normalizedEmail = email.strip().toLowerCase(Locale.ROOT);
        LocalDateTime expiresAt = EmailVerificationService.codeExpiresAt(LocalDateTime.now(KST));
        try {
            mailWorker.execute(() -> sendIfMatched(loginId, normalizedEmail));
        } catch (RejectedExecutionException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "비밀번호 복구 요청이 많아요. 잠시 후 다시 시도해 주세요.");
        }
        return new EmailVerificationSendResponse(normalizedEmail, expiresAt);
    }

    /** 확인 실패 이유를 공통 응답으로 보내 계정 상태와 코드 발급 여부를 숨긴다. */
    public EmailVerificationService.VerifiedEmailVerification confirmCode(String loginId, String email, String code) {
        try {
            var identity = localAuth.verifyPasswordResetIdentity(loginId, email);
            return verification.verifyPasswordResetCode(identity.email(), code);
        } catch (ResponseStatusException exception) {
            if (!exception.getStatusCode().is4xxClientError()) {
                throw exception;
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "인증번호를 확인하지 못했어요. 입력 내용을 확인하거나 인증번호를 다시 받아 주세요.");
        }
    }

    private void sendIfMatched(String loginId, String email) {
        try {
            var identity = localAuth.verifyPasswordResetIdentity(loginId, email);
            dispatch.sendPasswordResetVerificationCode(identity.email());
        } catch (ResponseStatusException exception) {
            if (!exception.getStatusCode().is4xxClientError()) {
                log.warn("비밀번호 복구 메일 처리 실패. status={}", exception.getStatusCode().value());
            }
        } catch (IllegalArgumentException exception) {
            // 이전 클라이언트에서 서버의 아이디 형식과 다른 값을 보낼 수 있다.
        } catch (RuntimeException exception) {
            log.error("비밀번호 복구 메일 처리 실패. type={}", exception.getClass().getSimpleName());
        }
    }

    @PreDestroy
    void stopMailWorker() {
        mailWorker.shutdown();
    }
}
