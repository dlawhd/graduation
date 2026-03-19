package com.example.demo.security;

import com.example.demo.jwt.JwtTokenProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;

@WebMvcTest(controllers = SecurityErrorHandlerTest.TestController.class)
@Import({
        SecurityErrorHandler.class,
        SecurityErrorHandlerTest.TestController.class,
        SecurityErrorHandlerTest.TestSecurityConfig.class
})
class SecurityErrorHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @DisplayName("로그인하지 않고 인증이 필요한 API에 접근하면 401 JSON 응답을 반환한다")
    void commenceReturns401Json() throws Exception {

        mockMvc.perform(get("/secure"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().encoding("UTF-8"))
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.error.message").value("로그인이 필요합니다."))
                .andExpect(jsonPath("$.error.path").value("/secure"));
    }

    @Test
    @DisplayName("로그인은 했지만 권한이 부족하면 403 JSON 응답을 반환한다")
    void handleReturns403Json() throws Exception {

        mockMvc.perform(get("/admin")
                        .with(user("eunseo").roles("USER")))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().encoding("UTF-8"))
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"))
                .andExpect(jsonPath("$.error.message").value("접근 권한이 없습니다."))
                .andExpect(jsonPath("$.error.path").value("/admin"));
    }

    @Test
    @DisplayName("관리자 권한이 있으면 정상 접근한다")
    void adminCanAccessAdminEndpoint() throws Exception {

        mockMvc.perform(get("/admin")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(content().string("admin ok"));
    }

    @Test
    @DisplayName("로그인만 하면 접근 가능한 API는 일반 사용자도 정상 접근한다")
    void authenticatedUserCanAccessSecureEndpoint() throws Exception {

        mockMvc.perform(get("/secure")
                        .with(user("eunseo").roles("USER")))
                .andExpect(status().isOk())
                .andExpect(content().string("secure ok"));
    }

    @RestController
    public static class TestController {

        @GetMapping("/secure")
        public String secure() {
            return "secure ok";
        }

        @GetMapping("/admin")
        public String admin() {
            return "admin ok";
        }
    }

    @TestConfiguration
    static class TestSecurityConfig {

        @Bean
        SecurityFilterChain securityFilterChain(
                HttpSecurity http,
                SecurityErrorHandler securityErrorHandler
        ) throws Exception {

            return http
                    .csrf(csrf -> csrf.disable())
                    .authorizeHttpRequests(auth -> auth
                            .requestMatchers("/secure").authenticated()
                            .requestMatchers("/admin").hasRole("ADMIN")
                            .anyRequest().permitAll()
                    )
                    .exceptionHandling(ex -> ex
                            .authenticationEntryPoint(securityErrorHandler)
                            .accessDeniedHandler(securityErrorHandler)
                    )
                    .build();
        }
    }
}