package shop.esjh.memoryjar.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.auth.EmailVerificationCrypto;
import shop.esjh.memoryjar.entity.EmailVerification;
import shop.esjh.memoryjar.enums.auth.EmailVerificationPurpose;
import shop.esjh.memoryjar.repository.EmailVerificationRepository;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/*
 * EmailVerificationServiceTest 역할
 *
 * 이메일 인증번호 발급 서비스의 핵심 동작을 확인한다.
 *
 * 확인 내용:
 *
 * 1. 6자리 인증번호 생성
 * 2. 이메일 소문자 정규화
 * 3. Hash 저장
 * 4. 5분 만료
 * 5. 60초 안 재전송 차단
 * 6. 재전송 시 기존 row 사용
 */
@ExtendWith(MockitoExtension.class)
class EmailVerificationServiceTest {

    private static final ZoneId KST =
            ZoneId.of(
                    "Asia/Seoul"
            );


    @Mock
    private EmailVerificationRepository
            emailVerificationRepository;

    @Mock
    private EmailVerificationCrypto
            emailVerificationCrypto;


    /*
     * @InjectMocks 대신 직접 생성한다.
     *
     * 생성자가 단순하고 어떤 의존성이 들어가는지
     * 테스트 코드에서도 명확하게 볼 수 있다.
     */
    private EmailVerificationService createService() {

        return new EmailVerificationService(
                emailVerificationRepository,
                emailVerificationCrypto
        );
    }


    @Test
    @DisplayName("회원가입용 6자리 이메일 인증번호를 발급하고 Hash를 저장한다")
    void issueSignupCode_createsVerification() {

        // given
        EmailVerificationService service =
                createService();

        when(
                emailVerificationRepository
                        .findByEmailAndPurposeForUpdate(
                                "eunseo@naver.com",
                                EmailVerificationPurpose.SIGNUP
                        )
        ).thenReturn(
                Optional.empty()
        );


        /*
         * 실제 HMAC 결과 대신
         * 테스트용 64자리 Hash를 반환한다.
         */
        String fakeHash =
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";


        when(
                emailVerificationCrypto
                        .hashCode(
                                eq("eunseo@naver.com"),
                                eq(EmailVerificationPurpose.SIGNUP),
                                anyString()
                        )
        ).thenReturn(
                fakeHash
        );


        // when
        LocalDateTime before =
                LocalDateTime.now(
                        KST
                );

        EmailVerificationService.IssuedVerificationCode result =
                service.issueSignupCode(
                        "  EunSeo@Naver.com  "
                );

        LocalDateTime after =
                LocalDateTime.now(
                        KST
                );


        // then

        /*
         * 이메일이 trim + 소문자 처리됐는지 확인
         */
        assertThat(
                result.email()
        ).isEqualTo(
                "eunseo@naver.com"
        );


        /*
         * 인증번호는 항상 숫자 6자리여야 한다.
         */
        assertThat(
                result.rawCode()
        ).matches(
                "\\d{6}"
        );


        /*
         * 약 5분 뒤로 만료시간이 잡혔는지 확인
         */
        assertThat(
                result.expiresAt()
        ).isBetween(
                before.plusMinutes(5),
                after.plusMinutes(5)
        );


        /*
         * Repository에 실제 저장된 Entity를 가져온다.
         */
        ArgumentCaptor<EmailVerification> captor =
                ArgumentCaptor.forClass(
                        EmailVerification.class
                );

        verify(
                emailVerificationRepository
        ).save(
                captor.capture()
        );


        EmailVerification saved =
                captor.getValue();


        assertThat(
                saved.getEmail()
        ).isEqualTo(
                "eunseo@naver.com"
        );

        assertThat(
                saved.getPurpose()
        ).isEqualTo(
                EmailVerificationPurpose.SIGNUP
        );

        /*
         * DB에는 rawCode가 아니라 Hash가 들어가야 한다.
         */
        assertThat(
                saved.getCodeHash()
        ).isEqualTo(
                fakeHash
        );

        assertThat(
                saved.getCodeHash()
        ).isNotEqualTo(
                result.rawCode()
        );

        assertThat(
                saved.getAttemptCount()
        ).isZero();
    }


    @Test
    @DisplayName("인증번호 발송 후 60초가 지나지 않으면 재전송을 막는다")
    void issueSignupCode_beforeCooldown_throws429() {

        // given
        EmailVerificationService service =
                createService();

        LocalDateTime now =
                LocalDateTime.now(
                        KST
                );


        EmailVerification existing =
                EmailVerification.issue(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                                + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        now.plusMinutes(5),

                        /*
                         * 방금 보낸 상태
                         */
                        now
                );


        when(
                emailVerificationRepository
                        .findByEmailAndPurposeForUpdate(
                                "eunseo@naver.com",
                                EmailVerificationPurpose.SIGNUP
                        )
        ).thenReturn(
                Optional.of(
                        existing
                )
        );


        // when & then
        assertThatThrownBy(
                () -> service.issueSignupCode(
                        "eunseo@naver.com"
                )
        )
                .isInstanceOf(
                        ResponseStatusException.class
                )
                .satisfies(
                        throwable -> {

                            ResponseStatusException ex =
                                    (ResponseStatusException) throwable;

                            assertThat(
                                    ex.getStatusCode()
                            ).isEqualTo(
                                    HttpStatus.TOO_MANY_REQUESTS
                            );
                        }
                );


        /*
         * 재전송이 거부됐으므로
         * 새로운 Hash도 만들면 안 된다.
         */
        verifyNoInteractions(
                emailVerificationCrypto
        );

        verify(
                emailVerificationRepository,
                never()
        ).save(
                any()
        );
    }


    @Test
    @DisplayName("60초가 지난 뒤 재전송하면 기존 인증 row를 새 번호로 갱신한다")
    void issueSignupCode_afterCooldown_reissuesExistingVerification() {

        // given
        EmailVerificationService service =
                createService();

        LocalDateTime now =
                LocalDateTime.now(
                        KST
                );


        EmailVerification existing =
                EmailVerification.issue(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                                + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        now.minusMinutes(1),
                        /*
                         * 마지막 발송이 2분 전이므로
                         * 60초 제한을 통과한다.
                         */
                        now.minusMinutes(2)
                );


        /*
         * 이전에 인증번호를 한 번 틀린 상태라고 가정한다.
         */
        existing.increaseAttemptCount();


        when(
                emailVerificationRepository
                        .findByEmailAndPurposeForUpdate(
                                "eunseo@naver.com",
                                EmailVerificationPurpose.SIGNUP
                        )
        ).thenReturn(
                Optional.of(
                        existing
                )
        );


        String newHash =
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                        + "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";


        when(
                emailVerificationCrypto
                        .hashCode(
                                eq("eunseo@naver.com"),
                                eq(EmailVerificationPurpose.SIGNUP),
                                anyString()
                        )
        ).thenReturn(
                newHash
        );


        // when
        service.issueSignupCode(
                "eunseo@naver.com"
        );


        // then

        /*
         * 기존 row가 새 Hash로 바뀌어야 한다.
         */
        assertThat(
                existing.getCodeHash()
        ).isEqualTo(
                newHash
        );


        /*
         * 새 인증번호를 발급했으므로
         * 이전 실패 횟수도 0으로 초기화되어야 한다.
         */
        assertThat(
                existing.getAttemptCount()
        ).isZero();


        /*
         * 새 Entity를 별도로 만드는 대신
         * 기존 Entity를 저장해야 한다.
         */
        verify(
                emailVerificationRepository
        ).save(
                same(existing)
        );
    }


    @Test
    @DisplayName("잘못된 이메일 형식은 인증번호를 발급하지 않는다")
    void issueSignupCode_invalidEmail_throwsException() {

        EmailVerificationService service =
                createService();


        assertThatThrownBy(
                () -> service.issueSignupCode(
                        "wrong-email"
                )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "이메일 형식을 확인해 주세요."
                );


        verifyNoInteractions(
                emailVerificationRepository,
                emailVerificationCrypto
        );
    }
}