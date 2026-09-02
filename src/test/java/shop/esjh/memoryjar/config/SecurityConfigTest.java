package shop.esjh.memoryjar.config;

import org.springframework.http.MediaType;
import shop.esjh.memoryjar.auth.OAuth2SuccessHandler;
import shop.esjh.memoryjar.jwt.JwtAuthenticationFilter;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import shop.esjh.memoryjar.service.*;
/*
 * LOCAL 로그인에 성공한 가짜 사용자를 만들 때 사용한다.
 */
import shop.esjh.memoryjar.entity.User;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// SecurityConfig 전체 흐름을 보는 테스트라서 @SpringBootTest 를 사용
@SpringBootTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=none"
})
@AutoConfigureMockMvc
class SecurityConfigTest {

    // 서버를 진짜로 띄우지 않아도 가짜 HTTP 요청을 보내서 응답을 검증할 수 있게 도와주는 도구
    // GET /api/test/protected, POST /api/test/protected
    @Autowired
    private MockMvc mockMvc;

    // OAuth2 로그인(예: 네이버 로그인)에 필요한 클라이언트 등록 정보 저장소
    @MockitoBean
    private ClientRegistrationRepository clientRegistrationRepository;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private OAuth2SuccessHandler oAuth2SuccessHandler;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private EmailVerificationDispatchService
            emailVerificationDispatchService;

    @MockitoBean
    private EmailVerificationService
            emailVerificationService;

    /*
     * 실제 LOCAL 인증 비즈니스 로직은 필요 없고
     * 이번 테스트에서는 Security 접근 규칙만 확인한다.
     */
    @MockitoBean
    private LocalAuthService localAuthService;

    /*
     * LOCAL 로그인 성공 후 Refresh Token을 발급하는 Service.
     *
     * SecurityConfigTest에서는 실제 DB에 토큰을 저장할 필요가 없으므로
     * Mock으로 교체한다.
     */
    @MockitoBean
    private RefreshTokenService refreshTokenService;


    /*
     * 로그인 성공 후 Access / Refresh Token을
     * HttpOnly Cookie에 넣어주는 Service.
     *
     * 여기서는 실제 쿠키 구현 자체보다
     * Security 접근 규칙을 확인하는 것이 목적이므로
     * Mock으로 사용한다.
     */
    @MockitoBean
    private AuthCookieService authCookieService;

    /**
     * 각 테스트 시작 전에 mock 필터 동작을 미리 설정한다.
     *
     * 왜 필요할까?
     * - JwtAuthenticationFilter 는 원래 요청을 가로채서 검사하는 역할이 있어.
     * - 그런데 mock 상태에서 아무 설정 없이 두면
     *   요청이 다음 필터/컨트롤러로 흘러가지 않을 수 있어.
     *
     * 그래서 여기서는
     * "나는 실제 검사는 안 할게. 대신 다음 필터로 그냥 넘길게!"
     * 라고 설정해 주는 거야.
     */
    @BeforeEach
    void setUp() throws Exception {
        doAnswer(invocation -> {
            // 첫 번째 인자: 현재 요청
            ServletRequest request = invocation.getArgument(0);

            // 두 번째 인자: 현재 응답
            ServletResponse response = invocation.getArgument(1);

            // 세 번째 인자: 다음 필터로 넘기는 통로
            FilterChain chain = invocation.getArgument(2);

            // 현재 필터는 검사 없이 바로 다음 필터로 넘긴다.
            chain.doFilter(request, response);
            return null;
        }).when(jwtAuthenticationFilter)
                .doFilter(any(ServletRequest.class), any(ServletResponse.class), any(FilterChain.class));
    }

    @Test
    @DisplayName("이메일 인증번호 확인 API는 로그인 없이 접근할 수 있다")
    void emailVerificationConfirm_withoutLogin_success()
            throws Exception {

        /*
         * 이메일 인증번호가 정상이라고 가정한다.
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
                        LocalDateTime.now()
                                .plusMinutes(15)
                )
        );


        /*
         * 이메일 인증 성공 후 Controller가
         * 기존 계정 여부도 확인하기 때문에
         * 그 결과 역시 Mock으로 준비한다.
         *
         * 이 Security 테스트에서는
         * 신규 이메일이라고 가정한다.
         */
        given(
                localAuthService
                        .findExistingAccountLoginMethods(
                                "eunseo@naver.com"
                        )
        ).willReturn(
                new LocalAuthService
                        .ExistingAccountLoginMethods(
                        false,
                        List.of()
                )
        );


        mockMvc.perform(
                        post(
                                "/api/v1/auth/email-verifications/confirm"
                        )
                                .with(
                                        csrf()
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
                );
    }

    @Test
    @DisplayName("LOCAL 로그인 API는 로그인하지 않은 사용자도 CSRF 토큰이 있으면 접근할 수 있다")
    void localLogin_withoutLogin_withCsrf_success()
            throws Exception {

        /*
         * =========================================================
         * given
         * =========================================================
         *
         * 아직 로그인하지 않은 사용자가
         *
         * 아이디:
         * eunseo01
         *
         * 비밀번호:
         * Memory123!
         *
         * 를 입력했다고 가정한다.
         */


        /*
         * LOCAL 로그인 성공 결과로 사용할
         * 가짜 User를 만든다.
         */
        User user =
                User.builder()
                        .id(
                                10L
                        )
                        .email(
                                "eunseo@example.com"
                        )
                        .name(
                                "은서"
                        )

                        /*
                         * 자체 가입 사용자는
                         * OAuth Provider가 없어도 된다.
                         */
                        .provider(
                                null
                        )
                        .providerId(
                                null
                        )
                        .build();


        /*
         * LocalAuthService에서는
         * 아이디와 비밀번호가 정상이라고 가정한다.
         */
        given(
                localAuthService.login(
                        "eunseo01",
                        "Memory123!"
                )
        ).willReturn(
                new LocalAuthService.LocalAuthResult(
                        user,
                        "eunseo01"
                )
        );


        /*
         * Refresh Token도 실제 DB에 만들지 않고
         * 가짜 값을 반환한다.
         */
        given(
                refreshTokenService.issue(
                        user
                )
        ).willReturn(
                "test-refresh-token"
        );


        /*
         * Access Token 역시
         * 실제 JWT를 생성하지 않고 가짜 문자열을 사용한다.
         */
        given(
                jwtTokenProvider.createAccessToken(
                        any(),
                        any()
                )
        ).willReturn(
                "test-access-token"
        );


        /*
         * =========================================================
         * when & then
         * =========================================================
         *
         * 중요한 점:
         *
         * .with(user(...))
         *
         * 를 넣지 않는다.
         *
         * 즉 정말 "로그인하지 않은 상태"로 요청한다.
         */
        mockMvc.perform(
                        post(
                                "/api/v1/auth/login"
                        )

                                /*
                                 * POST 요청이므로
                                 * 로그인 API라도 CSRF 토큰은 필요하다.
                                 */
                                .with(
                                        csrf()
                                )

                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )

                                .content(
                                        """
                                        {
                                          "loginId": "eunseo01",
                                          "password": "Memory123!"
                                        }
                                        """
                                )
                )

                /*
                 * SecurityConfig에서 permitAll 되어 있으므로
                 * 401이 아니라 정상적으로 Controller까지 들어가야 한다.
                 */
                .andExpect(
                        status().isOk()
                );
    }

    @Test
    @DisplayName("LOCAL 로그인 API는 공개 API여도 CSRF 토큰이 없으면 차단된다")
    void localLogin_withoutCsrf_forbidden()
            throws Exception {

        /*
         * =========================================================
         * LOCAL 로그인 API는 permitAll이지만
         * POST 요청이므로 CSRF 보호는 그대로 적용된다.
         *
         * 즉:
         *
         * 로그인 필요 여부와
         * CSRF 필요 여부는 서로 다른 문제다.
         *
         *
         * 로그인:
         * 필요 없음
         *
         * CSRF:
         * 필요함
         * =========================================================
         */

        mockMvc.perform(
                        post(
                                "/api/v1/auth/login"
                        )
                                /*
                                 * 일부러 .with(csrf())를 넣지 않는다.
                                 */
                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )
                                .content(
                                        """
                                        {
                                          "loginId": "eunseo01",
                                          "password": "Memory123!"
                                        }
                                        """
                                )
                )

                /*
                 * Spring Security의 CSRF Filter가
                 * Controller에 도착하기 전에 차단해야 한다.
                 */
                .andExpect(
                        status().isForbidden()
                );
    }


    @Test
    @DisplayName("이메일 인증번호 확인 API는 CSRF 토큰이 없으면 차단된다")
    void emailVerificationConfirm_withoutCsrf_forbidden()
            throws Exception {

        /*
         * /confirm은 회원가입 전 사용하는 공개 API라서
         * 로그인은 필요하지 않다.
         *
         * 하지만 POST 요청이기 때문에
         * CSRF 토큰이 없으면 Spring Security가 403으로 막아야 한다.
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
                .andExpect(
                        status().isForbidden()
                );
    }

    @Test
    @DisplayName("api 밖의 일반 경로는 로그인 없이 접근 가능하다")
    void openPath_withoutLogin_success() throws Exception {
        mockMvc.perform(get("/test/open"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("/api/v1/csrf 는 로그인 없이 접근 가능하다")
    void csrfEndpoint_withoutLogin_success() throws Exception {
        mockMvc.perform(get("/api/v1/csrf"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("/api/** 는 로그인 없이 접근하면 401이다")
    void apiPath_withoutLogin_unauthorized() throws Exception {
        mockMvc.perform(get("/api/test/protected"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("/api/** 는 로그인 상태면 접근 가능하다")
    void apiPath_withLogin_success() throws Exception {
        mockMvc.perform(get("/api/test/protected")
                        .with(user("tester")))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST /api/** 는 로그인해도 CSRF 토큰이 없으면 403이다")
    void postApi_withoutCsrf_forbidden() throws Exception {
        mockMvc.perform(post("/api/test/protected")
                        .with(user("tester")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /api/** 는 CSRF 토큰이 있으면 통과한다")
    void postApi_withCsrf_success() throws Exception {
        mockMvc.perform(post("/api/test/protected")
                        .with(user("tester"))
                        .with(csrf()))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("OPTIONS 요청은 로그인 없이 허용된다")
    void optionsRequest_permitAll() throws Exception {
        mockMvc.perform(options("/api/test/protected")
                        .header(HttpHeaders.ORIGIN, "http://localhost:3000")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("아이디 중복 확인 API는 로그인 없이 접근할 수 있다")
    void loginIdAvailability_withoutLogin_success()
            throws Exception {

        mockMvc.perform(
                        get(
                                "/api/v1/auth/login-id/availability"
                        )
                                .param(
                                        "loginId",
                                        "eunseo01"
                                )
                )
                .andExpect(
                        status().isOk()
                );
    }

    @Test
    @DisplayName("허용된 Origin 으로 온 preflight 요청에는 CORS 헤더가 내려간다")
    void cors_allowedOrigin_success() throws Exception {
        mockMvc.perform(options("/api/test/protected")
                        .header(HttpHeaders.ORIGIN, "http://localhost:3000")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN,
                        "http://localhost:3000"
                ))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
    }

    @Test
    @DisplayName("허용하지 않은 Origin의 CORS 요청은 차단한다")
    void cors_notAllowedOrigin_forbidden() throws Exception {
        mockMvc.perform(options("/api/test/protected")
                        .header(HttpHeaders.ORIGIN, "https://evil.example.com")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("JwtAuthenticationFilter 가 실제 필터 체인에 연결되어 있다")
    void jwtFilter_isConnected() throws Exception {
        mockMvc.perform(get("/api/test/protected")
                        .with(user("tester")))
                .andExpect(status().isOk());

        verify(jwtAuthenticationFilter, atLeastOnce())
                .doFilter(any(ServletRequest.class), any(ServletResponse.class), any(FilterChain.class));
    }

    @Test
    @DisplayName("이메일 인증번호 발송 API는 로그인 없이 접근할 수 있다")
    void emailVerification_withoutLogin_success()
            throws Exception {

        /*
         * Service 결과는 가짜 값으로 준비한다.
         *
         * 이 테스트의 목적은 실제 이메일 발송이 아니라
         * Security에서 401로 막히지 않는지 보는 것이다.
         */
        given(
                emailVerificationDispatchService
                        .sendSignupVerificationCode(
                                "eunseo@naver.com"
                        )
        ).willReturn(
                new EmailVerificationDispatchService
                        .VerificationDispatchResult(
                        "eunseo@naver.com",
                        LocalDateTime.now()
                                .plusMinutes(5)
                )
        );


        mockMvc.perform(
                        post(
                                "/api/v1/auth/email-verifications"
                        )

                                /*
                                 * POST 요청이므로
                                 * Memory Jar의 CSRF 정책은 그대로 지킨다.
                                 */
                                .with(
                                        csrf()
                                )

                                .contentType(
                                        MediaType.APPLICATION_JSON
                                )

                                .content(
                                        """
                                        {
                                          "email": "eunseo@naver.com"
                                        }
                                        """
                                )
                )
                .andExpect(
                        status().isOk()
                );
    }

    @Test
    @DisplayName("이메일 인증번호 발송 API는 CSRF 토큰이 없으면 차단된다")
    void emailVerification_withoutCsrf_isForbidden()
            throws Exception {

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
                                          "email": "eunseo@naver.com"
                                        }
                                        """
                                )
                )
                .andExpect(
                        status().isForbidden()
                );
    }

    @TestConfiguration
    static class TestEndpointConfig {
        @Bean
        TestController testController() {
            return new TestController();
        }
    }

    // ✅ 테스트용 임시 컨트롤러
    // 진짜 서비스 API 대신, 보안 설정만 확인할 수 있도록 아주 작은 엔드포인트만 만든 컨트롤러
    @RestController
    static class TestController {

        // 로그인 없이도 열려 있어야 하는 일반 경로
        @GetMapping("/test/open")
        public String open() {
            return "ok";
        }

        // 로그인한 사용자만 접근 가능한 보호 경로(GET)
        @GetMapping("/api/test/protected")
        public String protectedGet() {
            return "protected-ok";
        }

        // 로그인 + CSRF 토큰이 있어야 접근 가능한 보호 경로(POST)
        @PostMapping("/api/test/protected")
        public String protectedPost() {
            return "protected-post-ok";
        }
    }
}