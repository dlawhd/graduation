package shop.esjh.memoryjar.config;

import shop.esjh.memoryjar.config.exception.GlobalExceptionHandler;
import shop.esjh.memoryjar.jwt.JwtAuthenticationFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = GlobalExceptionHandlerTest.TestController.class,
        excludeFilters = @ComponentScan.Filter(
                type = FilterType.ASSIGNABLE_TYPE,
                classes = JwtAuthenticationFilter.class
        )
)
@Import({
        GlobalExceptionHandler.class,
        GlobalExceptionHandlerTest.TestController.class,
        GlobalExceptionHandlerTest.TestSecurityConfig.class
})
class GlobalExceptionHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("IllegalArgumentException이 발생하면 400 JSON 응답을 반환한다")
    void handleIllegalArgument() throws Exception {
        mockMvc.perform(get("/test/illegal"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.error.message").value("이름은 비워둘 수 없습니다."))
                .andExpect(jsonPath("$.error.path").value("/test/illegal"));
    }

    @Test
    @DisplayName("ResponseStatusException에 reason이 있으면 해당 메시지로 응답한다")
    void handleResponseStatusExceptionWithReason() throws Exception {
        mockMvc.perform(get("/test/unauthorized"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.error.message").value("토큰이 만료되었습니다."))
                .andExpect(jsonPath("$.error.path").value("/test/unauthorized"));
    }

    @Test
    @DisplayName("ResponseStatusException에 reason이 없으면 상태코드 기본 메시지로 응답한다")
    void handleResponseStatusExceptionWithoutReason() throws Exception {
        mockMvc.perform(get("/test/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.error.message").value("대상을 찾을 수 없습니다."))
                .andExpect(jsonPath("$.error.path").value("/test/not-found"));
    }

    @Test
    @DisplayName("매핑되지 않은 상태코드는 HTTP_상태코드와 기본 메시지로 응답한다")
    void handleResponseStatusExceptionWithDefaultBranch() throws Exception {
        mockMvc.perform(get("/test/conflict"))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error.code").value("HTTP_409"))
                .andExpect(jsonPath("$.error.message").value("요청 처리 중 오류가 발생했습니다."))
                .andExpect(jsonPath("$.error.path").value("/test/conflict"));
    }

    @Test
    @DisplayName("처리되지 않은 일반 예외는 500 JSON 응답을 반환한다")
    void handleGenericException() throws Exception {
        mockMvc.perform(get("/test/error"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.error.code").value("INTERNAL_SERVER_ERROR"))
                .andExpect(jsonPath("$.error.message").value("서버 내부 오류가 발생했습니다."))
                .andExpect(jsonPath("$.error.path").value("/test/error"));
    }

    @RestController
    static class TestController {

        @GetMapping("/test/illegal")
        public String illegal() {
            throw new IllegalArgumentException("이름은 비워둘 수 없습니다.");
        }

        @GetMapping("/test/unauthorized")
        public String unauthorized() {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "토큰이 만료되었습니다.");
        }

        @GetMapping("/test/not-found")
        public String notFound() {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        @GetMapping("/test/conflict")
        public String conflict() {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }

        @GetMapping("/test/error")
        public String error() {
            throw new RuntimeException("예상하지 못한 오류");
        }
    }

    @TestConfiguration
    static class TestSecurityConfig {

        @Bean
        SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(csrf -> csrf.disable())
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }
}