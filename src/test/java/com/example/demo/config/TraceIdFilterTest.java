package com.example.demo.config;

import com.example.demo.config.filter.TraceIdFilter;
import com.example.demo.jwt.JwtAuthenticationFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = TraceIdFilterTest.TestController.class,
        excludeFilters = @ComponentScan.Filter(
                type = FilterType.ASSIGNABLE_TYPE,
                classes = JwtAuthenticationFilter.class
        )
)
@Import({
        TraceIdFilter.class,
        TraceIdFilterTest.TestController.class,
        TraceIdFilterTest.TestSecurityConfig.class
})
class TraceIdFilterTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("요청이 들어오면 traceId가 생성되어 요청 안에서 조회할 수 있다")
    void traceIdIsCreatedDuringRequest() throws Exception {

        mockMvc.perform(get("/trace"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.traceId").isNotEmpty())
                .andExpect(jsonPath("$.traceId").value(matchesPattern("^[a-z0-9]{8}$")));
    }

    @Test
    @DisplayName("요청이 끝나면 MDC는 비워진다")
    void mdcIsClearedAfterRequest() throws Exception {

        mockMvc.perform(get("/trace"))
                .andExpect(status().isOk());

        // ✅ filter의 finally { MDC.clear(); } 때문에 요청 후에는 비워져 있어야 함
        assertThat(MDC.get("traceId")).isNull();
    }

    @Test
    @DisplayName("요청마다 새로운 traceId가 생성된다")
    void newTraceIdIsGeneratedPerRequest() throws Exception {

        String traceId1 = mockMvc.perform(get("/trace"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        String traceId2 = mockMvc.perform(get("/trace"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(traceId1).isNotEqualTo(traceId2);
    }

    @RestController
    static class TestController {

        @GetMapping("/trace")
        public Map<String, String> trace() {
            return Map.of("traceId", MDC.get("traceId"));
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