package shop.esjh.memoryjar.controller;

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

    @Test
    void 이메일_인증번호_확인_성공()
            throws Exception {

        LocalDateTime expiresAt =
                LocalDateTime.of(
                        2026,
                        8,
                        29,
                        15,
                        0
                );

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
                                "$.data.verificationToken"
                        ).value(
                                "verification-token"
                        )
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