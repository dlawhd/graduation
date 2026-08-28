package shop.esjh.memoryjar.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.service.mail.EmailSenderService;

import java.time.LocalDateTime;

/*
 * EmailVerificationDispatchService 역할
 *
 * 이메일 인증번호의:
 *
 * 1. 생성/DB 저장
 * 2. 실제 이메일 발송
 *
 * 두 작업의 전체 흐름을 조정하는 서비스야.
 *
 *
 * 특히 중요한 이유:
 *
 * AWS SES는 외부 네트워크 요청이기 때문에
 * 응답이 올 때까지 시간이 걸릴 수 있다.
 *
 * SES 응답을 기다리는 동안
 * DB 트랜잭션과 DB Connection을 계속 잡고 있으면
 * 서버 성능에 좋지 않다.
 *
 *
 * 그래서:
 *
 * EmailVerificationService
 *      ↓
 * 짧은 DB Transaction
 *      ↓
 * Transaction 종료
 *      ↓
 * AWS SES 발송
 *
 * 순서로 분리한다.
 *
 *
 * 예전에 FileService에서
 * S3 작업과 DB Transaction을 분리한 것과
 * 같은 생각이라고 보면 돼.
 */
@Service
public class EmailVerificationDispatchService {

    private final EmailVerificationService
            emailVerificationService;

    private final EmailSenderService
            emailSenderService;


    public EmailVerificationDispatchService(
            EmailVerificationService emailVerificationService,
            EmailSenderService emailSenderService
    ) {

        this.emailVerificationService =
                emailVerificationService;

        this.emailSenderService =
                emailSenderService;
    }


    /*
     * 회원가입용 인증번호를 발급하고
     * 실제 사용자 이메일로 전송한다.
     *
     *
     * NOT_SUPPORTED:
     *
     * 혹시 바깥에서 Transaction을 가진 상태로
     * 이 메서드를 호출하더라도
     * 그 Transaction을 잠시 중단한다.
     *
     * 따라서 SES 네트워크 호출 중에는
     * DB Connection을 오래 점유하지 않는다.
     */
    @Transactional(
            propagation = Propagation.NOT_SUPPORTED
    )
    public VerificationDispatchResult
    sendSignupVerificationCode(
            String email
    ) {

        /*
         * =====================================================
         * 1단계
         *
         * 인증번호 생성 + Hash + DB 저장
         *
         * EmailVerificationService의 @Transactional이
         * 이 호출 동안에만 짧게 열린다.
         * =====================================================
         */
        EmailVerificationService
                .IssuedVerificationCode issuedCode =
                emailVerificationService
                        .issueSignupCode(
                                email
                        );


        /*
         * 여기까지 돌아왔을 때
         * issueSignupCode()의 DB Transaction은 종료됐다.
         *
         *
         * =====================================================
         * 2단계
         *
         * DB Transaction 없이
         * 실제 AWS SES 호출
         * =====================================================
         */
        emailSenderService
                .sendSignupVerificationCode(
                        issuedCode.email(),
                        issuedCode.rawCode(),
                        issuedCode.expiresAt()
                );


        /*
         * Controller가 나중에 필요로 하는 정보만 반환한다.
         *
         * 중요:
         *
         * rawCode는 반환하지 않는다.
         *
         * 즉 브라우저가 실제 인증번호를
         * API 응답으로 알아낼 수 없도록 한다.
         */
        return new VerificationDispatchResult(
                issuedCode.email(),
                issuedCode.expiresAt()
        );
    }


    /*
     * 인증메일 발송 완료 후
     * 외부에 알려줘도 되는 정보만 담는다.
     *
     * 실제 6자리 인증번호는 절대로 포함하지 않는다.
     */
    public record VerificationDispatchResult(
            String email,
            LocalDateTime expiresAt
    ) {
    }
}