package shop.esjh.memoryjar.jwt;

import io.jsonwebtoken.Claims;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;

@WebMvcTest(controllers = JwtAuthenticationFilterTest.TestController.class)
@Import({
        JwtAuthenticationFilter.class,
        JwtAuthenticationFilterTest.TestController.class,
        JwtAuthenticationFilterTest.TestSecurityConfig.class

})
class JwtAuthenticationFilterTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @DisplayName("유효한 accessToken 쿠키가 있으면 인증이 붙고 /secure 요청이 성공한다")
    void authenticateWhenValidAccessTokenCookieExists() throws Exception {

        // 1. 가짜 토큰 문자열
        String accessToken = "valid-token";

        // 2. Claims도 가짜로 만들기
        Claims claims = Mockito.mock(Claims.class);

        // 3. 토큰 검증 성공으로 설정
        when(jwtTokenProvider.validate(accessToken)).thenReturn(true);

        // 4. 토큰에서 꺼낸 정보도 우리가 원하는 값으로 넣기
        when(jwtTokenProvider.getClaimsFromToken(accessToken)).thenReturn(claims);
        when(claims.getSubject()).thenReturn("1");
        when(claims.get("email")).thenReturn("test@example.com");
        when(claims.get("name")).thenReturn("은서");
        when(claims.get("birthyear")).thenReturn("2000");

        // 5. accessToken 쿠키를 담아서 인증 필요한 엔드포인트 호출
        mockMvc.perform(get("/secure")
                        .cookie(new Cookie("accessToken", accessToken)))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.userId").value("1"))
                .andExpect(jsonPath("$.email").value("test@example.com"))
                .andExpect(jsonPath("$.name").value("은서"))
                .andExpect(jsonPath("$.birthyear").value("2000"));
    }

    @Test
    @DisplayName("accessToken 쿠키가 없으면 인증되지 않아 /secure 요청은 401이다")
    void return401WhenCookieDoesNotExist() throws Exception {

        mockMvc.perform(get("/secure"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("accessToken 쿠키가 있어도 토큰이 유효하지 않으면 /secure 요청은 401이다")
    void return401WhenTokenIsInvalid() throws Exception {

        String accessToken = "invalid-token";

        // 토큰 검증 실패
        when(jwtTokenProvider.validate(accessToken)).thenReturn(false);

        mockMvc.perform(get("/secure")
                        .cookie(new Cookie("accessToken", accessToken)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("공개 엔드포인트는 토큰이 없어도 접근 가능하다")
    void publicEndpointIsAccessibleWithoutToken() throws Exception {

        mockMvc.perform(get("/public"))
                .andExpect(status().isOk())
                .andExpect(content().string("public ok"));
    }

    @RestController
    static class TestController {

        @GetMapping("/public")
        public String publicEndpoint() {
            return "public ok";
        }
        // 인증된 사람만 들어갈 수 있는 문, 필터가 SecurityContext에 넣어준 principal 값을 그대로 꺼내서 반환
        @GetMapping("/secure")
        public Map<String, Object> secureEndpoint(Authentication authentication) {
            return (Map<String, Object>) authentication.getPrincipal();
        }
    }

    // 필터가 실제 요청 흐름에서 인증을 붙이는지
    @TestConfiguration
    static class TestSecurityConfig {

        @Bean
        SecurityFilterChain securityFilterChain(
                HttpSecurity http,
                JwtAuthenticationFilter jwtAuthenticationFilter
        ) throws Exception {

            return http
                    .csrf(csrf -> csrf.disable())
                    .authorizeHttpRequests(auth -> auth
                            .requestMatchers("/public").permitAll()
                            .anyRequest().authenticated()
                    )
                    .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                    .exceptionHandling(ex -> ex
                            .authenticationEntryPoint((request, response, authException) ->
                                    response.sendError(HttpServletResponse.SC_UNAUTHORIZED))
                    )
                    .build();
        }
    }
}