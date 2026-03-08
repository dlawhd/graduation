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

// ✅ 누가 어떤 URL에 접근할 수 있는지(권한 규칙)와 로그인 방식(OAuth2), JWT 필터적용, CORS 정책을 한 곳에서 설정 하는 보안 설정 파일
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
                 // ✅ CSRF 설정
                 // CSRF는 "사용자가 모르게 위험한 요청이 날아가는 공격"을 막는 것. 프론트(React)가 쓸 수 있게 쿠키 저장소 방식을 사용하는 중
                .csrf(csrf -> csrf

                        // CookieCsrfTokenRepository는 기본적으로
                        // 쿠키 이름: XSRF-TOKEN / 헤더 이름: X-XSRF-TOKEN 규칙을 사용.
                        //withHttpOnlyFalse()를 쓰는 이유: 프론트가 이 CSRF 토큰을 읽어서 요청 헤더에 넣을 수 있게 하기 위해서.
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())

                        // ✅ CsrfTokenRequestAttributeHandler
                        // 프론트가 헤더로 보낸 CSRF 토큰을 스프링 시큐리티가 잘 읽을 수 있게 도와주는 설정.
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                )

                //  ✅ CORS 설정 연결, 프론트(www.esjh.shop)와 백(api.esjh.shop)는 주소가 다르기 때문에 어떤 요청을 허용할지 미리 알려줘야 함
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))

                // ✅ URL별 접근 규칙 설정
                .authorizeHttpRequests(auth -> auth

                        // ✅ OPTIONS 요청은 항상 허용
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // ✅ /api/csrf 는 로그인 없이 허용, 로그인 전/후 상관없이 먼저 받아야 할 수 있으니 열어둠.
                        .requestMatchers("/api/csrf").permitAll()

                        // ✅ 로그인 없이 접근 가능한 기본 주소들
                        .requestMatchers("/", "/error", "/login/**", "/oauth2/**").permitAll()
                        .requestMatchers("/api/auth/refresh", "/api/auth/logout").permitAll()

                        // JwtAuthenticationFilter가 앞에서 accessToken을 검사해서 로그인 사용자로 인정되면 접근 가능해짐.
                        .requestMatchers("/api/**").authenticated()

                        // ✅ /api/** 는 로그인 필요
                        .anyRequest().permitAll()
                )

                // ✅ 네이버 로그인 성공 후에는 그냥 끝나는 게 아니라 successHandler가 실행되게 연결.
                .oauth2Login(oauth -> oauth
                        .successHandler(oAuth2SuccessHandler)
                );

        // ✅ API 요청이 들어왔을 때 먼저 accessToken을 검사해서 "로그인한 사용자"인지 세팅해줘야 하기 때문
        http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    // ✅ CORS 설정 메서드
    // 프론트와 백엔드가 서로 다른 주소일 때브라우저가 "이 요청 허용해도 되나요?"를 검사하는데, 그 허용 규칙을 만드는 메서드.
    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        // ✅ 정확히 허용할 프론트 주소들
        config.setAllowedOrigins(List.of(
                "http://localhost:3000",
                "https://www.esjh.shop"
        ));

        // ✅ vercel처럼 주소가 바뀌는 건 patterns로
        config.setAllowedOriginPatterns(List.of(
                "https://*.vercel.app"
        ));

        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));

        // ✅ 쿠키 전송 허용
        config.setAllowCredentials(true);

        // ✅ 위에서 만든 CORS 규칙을 모든 주소("/**")에 적용
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
