package shop.esjh.memoryjar.config;

import shop.esjh.memoryjar.auth.OAuth2SuccessHandler;
import shop.esjh.memoryjar.config.properties.AppProperties;
import shop.esjh.memoryjar.jwt.JwtAuthenticationFilter;
import shop.esjh.memoryjar.security.SecurityErrorHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
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
    private final SecurityErrorHandler securityErrorHandler;
    private final ClientRegistrationRepository clientRegistrationRepository;
    // application.yml에 적어둔 공통 CORS 주소를 가져온다.
    private final AppProperties appProperties;

    public SecurityConfig(
            OAuth2SuccessHandler oAuth2SuccessHandler,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            SecurityErrorHandler securityErrorHandler,
            ClientRegistrationRepository clientRegistrationRepository,
            AppProperties appProperties
    ) {
        this.oAuth2SuccessHandler = oAuth2SuccessHandler;
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.securityErrorHandler = securityErrorHandler;
        this.clientRegistrationRepository = clientRegistrationRepository;
        this.appProperties = appProperties;
    }

    /*
     * NAVER / Google OAuth 로그인 요청을
     * 각 Provider에 맞게 꾸며주는 Resolver를 만든다.
     *
     * NAVER:
     * - auth_type=reauthenticate
     *
     * Google:
     * - prompt=select_account
     */
    private OAuth2AuthorizationRequestResolver socialAuthorizationRequestResolver() {
        return new SocialAuthorizationRequestResolver(
                clientRegistrationRepository
        );
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

                // ✅ Spring Security에서 나는 401 / 403 에러를 우리가 만든 형식으로 내려주기
                .exceptionHandling(exception -> exception
                        .authenticationEntryPoint(securityErrorHandler) // 로그인 안 됨 -> 401
                        .accessDeniedHandler(securityErrorHandler)      // 권한 없음 -> 403
                )

                // ✅ URL별 접근 규칙 설정
                .authorizeHttpRequests(auth -> auth

                        // ✅ OPTIONS 요청은 항상 허용
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // ✅ /api/csrf 는 로그인 없이 허용, 로그인 전/후 상관없이 먼저 받아야 할 수 있으니 열어둠.
                        .requestMatchers("/api/v1/csrf").permitAll()

                        // ✅ 로그인 없이 접근 가능한 기본 주소들
                        .requestMatchers("/", "/error", "/login/**", "/oauth2/**").permitAll()
                        /*
                         * 자체 회원가입 아이디 중복 확인은
                         * 로그인하기 전 사용해야 하므로 공개한다.
                         *
                         * GET으로만 열어서 필요한 HTTP Method만 허용한다.
                         */
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/auth/login-id/availability"
                        ).permitAll()

                        /*
                         * 회원가입 전에 이메일 인증번호를 받아야 하므로
                         * 로그인하지 않은 사용자도 호출할 수 있어야 한다.
                         *
                         * 단:
                         *
                         * permitAll()
                         * = 로그인 없이 접근 가능
                         *
                         * 이라는 뜻이지,
                         *
                         * CSRF를 끈다는 뜻은 아니다.
                         *
                         * POST 요청이므로 기존 Memory Jar 정책대로
                         * CSRF 토큰은 계속 필요하다.
                         */
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/v1/auth/email-verifications"
                        ).permitAll()

                        .requestMatchers("/api/v1/auth/refresh", "/api/v1/auth/logout").permitAll()

                        // JwtAuthenticationFilter가 앞에서 accessToken을 검사해서 로그인 사용자로 인정되면 접근 가능해짐.
                        .requestMatchers("/api/**").authenticated()

                        // ✅ /api/** 는 로그인 필요
                        .anyRequest().permitAll()
                )

                /*
                 * OAuth2 로그인 설정
                 *
                 * NAVER와 Google 모두 SocialAuthorizationRequestResolver를 거친 뒤
                 * 로그인 성공 시 공통 OAuth2SuccessHandler로 이동한다.
                 */
                .oauth2Login(oauth -> oauth
                        .authorizationEndpoint(authorization -> authorization
                                .authorizationRequestResolver(
                                        socialAuthorizationRequestResolver()
                                )
                        )
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

        /*
         * application.yml과 application-prod.yml에서
         * 현재 실행 환경에 맞는 허용 주소를 가져온다.
         *
         * 이렇게 하면 REST와 WebSocket이 같은 주소 목록을 사용한다.
         */
        config.setAllowedOriginPatterns(
                appProperties.getCors().getAllowedOriginPatterns()
        );

        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));

        // ✅ 쿠키 전송 허용
        config.setAllowCredentials(true);

        // ✅ 위에서 만든 CORS 규칙을 모든 주소("/**")에 적용
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
