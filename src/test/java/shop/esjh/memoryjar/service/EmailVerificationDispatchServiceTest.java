package shop.esjh.memoryjar.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.service.mail.EmailSenderService;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/*
 * EmailVerificationDispatchServiceTest 역할
 *
 * 이메일 인증번호가:
 *
 * DB 발급
 *      ↓
 * 실제 메일 발송
 *
 * 순서로 연결되는지 확인한다.
 *
 * 실제 AWS SES는 호출하지 않는다.
 */
@ExtendWith(MockitoExtension.class)
class EmailVerificationDispatchServiceTest {

    @Mock
    private EmailVerificationService
            emailVerificationService;

    @Mock
    private EmailSenderService
            emailSenderService;


    @Test
    @DisplayName("인증번호를 발급한 뒤 실제 이메일 발송 서비스에 전달한다")
    void sendSignupVerificationCode_issuesAndSends() {

        // given

        EmailVerificationDispatchService service =
                new EmailVerificationDispatchService(
                        emailVerificationService,
                        emailSenderService
                );


        LocalDateTime expiresAt =
                LocalDateTime.of(
                        2026,
                        8,
                        26,
                        16,
                        30
                );


        when(
                emailVerificationService
                        .issueSignupCode(
                                "eunseo@naver.com"
                        )
        ).thenReturn(
                new EmailVerificationService
                        .IssuedVerificationCode(
                        "eunseo@naver.com",
                        "482193",
                        expiresAt
                )
        );


        // when

        EmailVerificationDispatchService
                .VerificationDispatchResult result =
                service.sendSignupVerificationCode(
                        "eunseo@naver.com"
                );


        // then

        /*
         * DB 인증번호 발급이 먼저 호출됐는지 확인
         */
        verify(
                emailVerificationService
        ).issueSignupCode(
                "eunseo@naver.com"
        );


        /*
         * 실제 이메일 발송 Service에는
         * 발급받은 rawCode가 전달되어야 한다.
         */
        verify(
                emailSenderService
        ).sendSignupVerificationCode(
                "eunseo@naver.com",
                "482193",
                expiresAt
        );


        /*
         * 외부 반환값에는 인증번호가 존재하지 않는다.
         */
        assertThat(
                result.email()
        ).isEqualTo(
                "eunseo@naver.com"
        );

        assertThat(
                result.expiresAt()
        ).isEqualTo(
                expiresAt
        );
    }
}