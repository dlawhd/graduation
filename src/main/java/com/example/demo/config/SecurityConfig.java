package com.example.demo.config;

import com.example.demo.auth.OAuth2SuccessHandler;
import com.example.demo.jwt.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

// ✅ 누가 어떤 URL에 접근할 수 있는지(권한 규칙)와 로그인 방식(OAuth2), JWT 필터 적용, CORS 정책을 한 곳에서 설정하는 보안 설정 파일
@Configuration
public class SecurityConfig {

    private final OAuth2SuccessHandler oAuth2SuccessHandler;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(OAuth2SuccessHandler oAuth2SuccessHandler,
                          JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.oAuth2SuccessHandler = oAuth2SuccessHandler;
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // ✅ CSRF "켜기" + SPA(React)에서 쓰기 좋게 "쿠키 저장소" 사용
                .csrf(csrf -> csrf
                        // CookieCsrfTokenRepository는 기본적으로
                        // 쿠키 이름: XSRF-TOKEN / 헤더 이름: X-XSRF-TOKEN 규칙을 사용해. :contentReference[oaicite:1]{index=1}
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        // ✅ SPA는 "헤더로 토큰을 보낼 것"이라서 request handler를 명시해두면 안정적
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                )

                // ✅ CORS: 아래 corsConfigurationSource()를 쓰도록 연결
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeHttpRequests(auth -> auth
                        // ✅ 프리플라이트(OPTIONS)는 항상 열어두기
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // ✅ CSRF 토큰을 "처음 받는" 엔드포인트는 열어두자
                        .requestMatchers("/api/csrf").permitAll()

                        .requestMatchers("/", "/error", "/login/**", "/oauth2/**").permitAll()
                        .requestMatchers("/api/auth/refresh", "/api/auth/logout").permitAll()

                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll()
                )
                .oauth2Login(oauth -> oauth
                        .successHandler(oAuth2SuccessHandler)
                );

        http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        // ✅ 정확히 고정된 도메인들은 origins로
        config.setAllowedOrigins(List.of(
                "http://localhost:3000",
                "https://www.esjh.shop"
        ));

        // ✅ vercel처럼 주소가 바뀌는 건 patterns로 (와일드카드 OK)
        config.setAllowedOriginPatterns(List.of(
                "https://*.vercel.app"
        ));

        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
