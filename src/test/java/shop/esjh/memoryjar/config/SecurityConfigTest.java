package shop.esjh.memoryjar.config;

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

import static org.mockito.ArgumentMatchers.any;
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
                        .header(HttpHeaders.ORIGIN, "https://www.esjh.shop")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("허용된 Origin 으로 온 preflight 요청에는 CORS 헤더가 내려간다")
    void cors_allowedOrigin_success() throws Exception {
        mockMvc.perform(options("/api/test/protected")
                        .header(HttpHeaders.ORIGIN, "https://www.esjh.shop")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "https://www.esjh.shop"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
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