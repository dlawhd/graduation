package shop.esjh.memoryjar.controller;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import shop.esjh.memoryjar.dto.auth.response.LoginIdAvailabilityResponse;
import shop.esjh.memoryjar.dto.auth.response.EmailVerificationSendResponse;
import jakarta.servlet.http.Cookie;
import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

// 컨트롤러 테스트는 요청이 잘 들어오는지, 응답 상태코드가 맞는지, JSON 결과가 맞는지, 서비스를 잘 호출하는지를 빠르게 확인하는 게 목적
@WebMvcTest(AuthController.class) // AuthController 중심으로 웹 테스트 환경을 만듦
@AutoConfigureMockMvc(addFilters = false) // 테스트할 때 보안 필터(Security Filter)는 잠깐 끄는 옵션
@ActiveProfiles("test")
class AuthControllerTest {


    @Autowired
    private MockMvc mockMvc; // 가짜 브라우저 역할을 하는 도구. 실제로 서버를 띄우지 않아도 HTTP 요청을 보낸 것처럼 테스트할 수 있다

    // 가짜 객체(mock)
    @MockitoBean
    private RefreshTokenService refreshTokenService;

    @MockitoBean
    private AuthCookieService authCookieService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private EmailVerificationService emailVerificationService;

    /*
     * 실제 AWS SES를 호출하지 않도록
     * Controller 테스트에서는 DispatchService를 Mock으로 사용한다.
     */
    @MockitoBean
    private EmailVerificationDispatchService
            emailVerificationDispatchService;

    /*
     * LOCAL 자체 로그인 서비스 Mock
     *
     * AuthController 생성자에 새로 추가됐기 때문에
     * Controller 테스트에서도 가짜 Bean을 넣어준다.
     */
    @MockitoBean
    private LocalAuthService localAuthService;

    @Test
    void refresh쿠키가_없으면_401() throws Exception {

        // .with(csrf())는 POST 요청이라 CSRF 토큰을 함께 붙여준다
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()))

                // 응답 상태코드가 401인지 확인
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refresh성공시_ok_true와_쿠키_재발급() throws Exception {
        User user = User.builder()
                .id(1L)
                .email("test@test.com")
                .name("은서")
                .birthyear("2000")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        given(refreshTokenService.rotate("old-refresh"))
                .willReturn(new RefreshTokenService.Rotation(user, "new-refresh"));

        given(jwtTokenProvider.createAccessToken(eq("1"), anyMap()))
                .willReturn("new-access");

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .cookie(new Cookie("refreshToken", "old-refresh")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));

        // 컨트롤러가 새 access 쿠키를 심었는지 확인
        verify(authCookieService).setAccessCookie(any(), eq("new-access"));

        // 컨트롤러가 새 refresh 쿠키를 심었는지 확인
        verify(authCookieService).setRefreshCookie(any(), eq("new-refresh"));
    }

    @Test
    void logout은_쿠키_삭제를_호출한다() throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout")
                        .with(csrf())
                        .cookie(new Cookie("refreshToken", "refresh-value")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));

        // refresh token 폐기 메서드가 호출되었는지 확인
        verify(refreshTokenService).revokeIfPresent("refresh-value");

        // access 쿠키 삭제 메서드가 호출되었는지 확인
        verify(authCookieService).clearAccessCookie(any());

        // refresh 쿠키 삭제 메서드가 호출되었는지 확인
        verify(authCookieService).clearRefreshCookie(any());
    }

    @Test
    void 이메일_인증번호_발송_성공() throws Exception {

        // given
        LocalDateTime expiresAt =
                LocalDateTime.of(
                        2026,
                        8,
                        28,
                        16,
                        30
                );

        given(
                emailVerificationDispatchService
                        .sendSignupVerificationCode(
                                "EunSeo@Naver.com"
                        )
        ).willReturn(
                new EmailVerificationDispatchService
                        .VerificationDispatchResult(
                        "eunseo@naver.com",
                        expiresAt
                )
        );


        // when & then
        mockMvc.perform(
                        post(
                                "/api/v1/auth/email-verifications"
                        )
                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )
                                .content(
                                        """
                                        {
                                          "email": "EunSeo@Naver.com"
                                        }
                                        """
                                )
                )
                .andExpect(
                        status().isOk()
                )
                .andExpect(
                        jsonPath(
                                "$.data.email"
                        ).value(
                                "eunseo@naver.com"
                        )
                )
                .andExpect(
                        jsonPath(
                                "$.data.expiresAt"
                        ).exists()
                );


        verify(
                emailVerificationDispatchService
        ).sendSignupVerificationCode(
                "EunSeo@Naver.com"
        );
    }

    /*
     * =========================================================
     * 이메일 인증 성공 + 기존 NAVER 계정 조회 테스트
     * =========================================================
     *
     * 확인하는 흐름:
     *
     * 1. 사용자가 이메일 인증번호를 정확하게 입력한다.
     * 2. EmailVerificationService에서 인증 성공 결과를 반환한다.
     * 3. 인증된 이메일이 기존 계정인지 LocalAuthService에 확인한다.
     * 4. 기존 NAVER 계정이라면
     *    existingAccount=true,
     *    loginMethods=["NAVER"]
     *    가 프론트로 내려가는지 확인한다.
     */
    @Test
    void 이메일_인증번호_확인_성공()
            throws Exception {

        /*
         * =====================================================
         * given
         * =====================================================
         */

        /*
         * 이메일 인증 완료 후 발급되는
         * verificationToken의 만료 시간이다.
         */
        LocalDateTime expiresAt =
                LocalDateTime.of(
                        2026,
                        8,
                        29,
                        15,
                        0
                );


        /*
         * 사용자가 입력한 인증번호가 맞다고 가정한다.
         *
         * 실제 AWS SES나 DB 인증 로직을 실행하는 것이 아니라
         * Controller 테스트에서는 Mock 결과를 반환한다.
         */
        given(
                emailVerificationService
                        .verifySignupCode(
                                "eunseo@naver.com",
                                "481076"
                        )
        ).willReturn(
                new EmailVerificationService
                        .VerifiedEmailVerification(
                        "eunseo@naver.com",
                        "verification-token",
                        expiresAt
                )
        );


        /*
         * 인증까지 성공한 이메일을 확인했더니
         * 이미 NAVER 소셜 로그인으로
         * 가입되어 있는 사용자라고 가정한다.
         *
         * 결과:
         *
         * existingAccount = true
         * loginMethods = ["NAVER"]
         */
        given(
                localAuthService
                        .findExistingAccountLoginMethods(
                                "eunseo@naver.com"
                        )
        ).willReturn(
                new LocalAuthService
                        .ExistingAccountLoginMethods(
                        true,
                        List.of(
                                "NAVER"
                        )
                )
        );


        /*
         * =====================================================
         * when & then
         * =====================================================
         *
         * 실제 사용자가 이메일 인증번호 확인 API를
         * 호출한 것처럼 요청한다.
         */
        mockMvc.perform(
                        post(
                                "/api/v1/auth/email-verifications/confirm"
                        )
                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )
                                .content(
                                        """
                                        {
                                          "email": "eunseo@naver.com",
                                          "code": "481076"
                                        }
                                        """
                                )
                )

                /*
                 * 정상 인증이므로 HTTP 200
                 */
                .andExpect(
                        status().isOk()
                )

                /*
                 * 인증된 이메일 확인
                 */
                .andExpect(
                        jsonPath(
                                "$.data.email"
                        ).value(
                                "eunseo@naver.com"
                        )
                )

                /*
                 * 회원가입에 사용할
                 * verificationToken 확인
                 */
                .andExpect(
                        jsonPath(
                                "$.data.verificationToken"
                        ).value(
                                "verification-token"
                        )
                )

                /*
                 * 이미 존재하는 계정인지 확인한다.
                 */
                .andExpect(
                        jsonPath(
                                "$.data.existingAccount"
                        ).value(
                                true
                        )
                )

                /*
                 * 기존 로그인 방법이
                 * NAVER인지 확인한다.
                 */
                .andExpect(
                        jsonPath(
                                "$.data.loginMethods[0]"
                        ).value(
                                "NAVER"
                        )
                );


        /*
         * Controller가 인증 성공 후
         * 기존 계정 조회 Service까지
         * 정확하게 호출했는지 확인한다.
         */
        verify(
                localAuthService
        ).findExistingAccountLoginMethods(
                "eunseo@naver.com"
        );
    }

    /*
     * =========================================================
     * 신규 이메일 인증 성공 테스트
     * =========================================================
     *
     * 아직 Memory Jar에서 사용되지 않은 이메일이면:
     *
     * existingAccount = false
     * loginMethods = []
     *
     * 가 내려오는지 확인한다.
     *
     * 프론트는 이 결과를 보고
     * "Memory Jar 시작하기" 버튼을 보여준다.
     */
    @Test
    void 이메일_인증번호_확인_성공_신규이메일()
            throws Exception {

        /*
         * 인증 토큰 만료 시간
         */
        LocalDateTime expiresAt =
                LocalDateTime.of(
                        2026,
                        8,
                        31,
                        21,
                        0
                );


        /*
         * 이메일 인증번호가 정상이라고 가정한다.
         */
        given(
                emailVerificationService
                        .verifySignupCode(
                                "new@example.com",
                                "123456"
                        )
        ).willReturn(
                new EmailVerificationService
                        .VerifiedEmailVerification(
                        "new@example.com",
                        "new-verification-token",
                        expiresAt
                )
        );


        /*
         * 이 이메일은 기존 User가 없는
         * 완전히 새로운 이메일이라고 가정한다.
         */
        given(
                localAuthService
                        .findExistingAccountLoginMethods(
                                "new@example.com"
                        )
        ).willReturn(
                new LocalAuthService
                        .ExistingAccountLoginMethods(
                        false,
                        List.of()
                )
        );


        /*
         * 실제 HTTP 요청
         */
        mockMvc.perform(
                        post(
                                "/api/v1/auth/email-verifications/confirm"
                        )
                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )
                                .content(
                                        """
                                        {
                                          "email": "new@example.com",
                                          "code": "123456"
                                        }
                                        """
                                )
                )

                /*
                 * 정상 응답
                 */
                .andExpect(
                        status().isOk()
                )

                /*
                 * 신규 사용자이므로 false
                 */
                .andExpect(
                        jsonPath(
                                "$.data.existingAccount"
                        ).value(
                                false
                        )
                )

                /*
                 * 아직 로그인 방법이 없으므로
                 * 빈 배열이어야 한다.
                 */
                .andExpect(
                        jsonPath(
                                "$.data.loginMethods"
                        ).isEmpty()
                );


        /*
         * 기존 계정 확인 Service가
         * 정확한 이메일로 호출됐는지 확인한다.
         */
        verify(
                localAuthService
        ).findExistingAccountLoginMethods(
                "new@example.com"
        );
    }

    @Test
    void 이메일_인증번호_발송시_이메일_형식이_잘못되면_400() throws Exception {

        mockMvc.perform(
                        post(
                                "/api/v1/auth/email-verifications"
                        )
                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )
                                .content(
                                        """
                                        {
                                          "email": "wrong-email"
                                        }
                                        """
                                )
                )
                .andExpect(
                        status().isBadRequest()
                );


        /*
         * DTO 검증에서 이미 막혔기 때문에
         * 실제 인증번호 발송 Service까지 가면 안 된다.
         */
        verifyNoInteractions(
                emailVerificationDispatchService
        );
    }

    /*
     * =========================================================
     * 회원가입 비밀번호 HTTP 검증 테스트
     * =========================================================
     *
     * 프론트를 거치지 않고
     * /api/v1/auth/signup API를 직접 호출하더라도
     * 약한 비밀번호가 서버에서 차단되는지 확인한다.
     */
    @ParameterizedTest
    @ValueSource(
            strings = {
                    "memory1234",
                    "memory!!!!",
                    "12345678!"
            }
    )
    void 회원가입_비밀번호_필수조건이_빠지면_400(
            String invalidPassword
    ) throws Exception {

        /*
         * 실제 회원가입 API처럼 JSON 요청을 보낸다.
         *
         * password만 잘못된 값이고
         * 나머지 필드는 정상값이다.
         */
        mockMvc.perform(
                        post(
                                "/api/v1/auth/signup"
                        )
                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )
                                .content(
                                        """
                                        {
                                          "loginId": "eunseo01",
                                          "password": "%s",
                                          "nickname": "은서",
                                          "email": "eunseo@example.com",
                                          "verificationToken": "verification-token"
                                        }
                                        """.formatted(
                                                invalidPassword
                                        )
                                )
                )

                /*
                 * DTO의 @Pattern 검증에서
                 * 400 Bad Request가 나와야 한다.
                 */
                .andExpect(
                        status().isBadRequest()
                )

                /*
                 * 사용자에게 보여줄 오류 메시지도
                 * 우리가 정한 정책과 일치해야 한다.
                 */
                .andExpect(
                        jsonPath(
                                "$.error.message"
                        ).value(
                                "비밀번호는 영문, 숫자, 특수문자를 각각 1자 이상 포함해 주세요."
                        )
                );

        /*
         * @Valid에서 이미 막혔으므로
         * 실제 LocalAuthService.signup()까지
         * 넘어가면 안 된다.
         */
        verifyNoInteractions(
                localAuthService
        );
    }

    @Test
    void 아이디_중복확인_성공() throws Exception {

        // given
        given(
                localAuthService
                        .checkLoginIdAvailability(
                                "EunSeo01"
                        )
        ).willReturn(
                new LoginIdAvailabilityResponse(
                        "eunseo01",
                        true
                )
        );


        // when & then
        mockMvc.perform(
                        get(
                                "/api/v1/auth/login-id/availability"
                        )
                                .param(
                                        "loginId",
                                        "EunSeo01"
                                )
                )
                .andExpect(
                        status().isOk()
                )
                .andExpect(
                        jsonPath(
                                "$.data.loginId"
                        ).value(
                                "eunseo01"
                        )
                )
                .andExpect(
                        jsonPath(
                                "$.data.available"
                        ).value(
                                true
                        )
                );


        verify(
                localAuthService
        ).checkLoginIdAvailability(
                "EunSeo01"
        );
    }
}