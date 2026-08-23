package shop.esjh.memoryjar.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import static org.assertj.core.api.Assertions.assertThat;

/*
 * SocialAuthorizationRequestResolverTest 역할
 *
 * Memory Jar에서 소셜 로그인 요청을 시작할 때
 * Provider마다 필요한 추가 OAuth 파라미터가
 * 정확하게 붙는지 확인하는 테스트다.
 *
 * 실제 네이버 / Google / Kakao 서버와 통신하지 않는다.
 *
 * 테스트용 ClientRegistration을 만들어서
 * SocialAuthorizationRequestResolver가 생성하는
 * OAuth 요청 내용만 확인한다.
 *
 * 검증 대상:
 *
 * NAVER
 * → auth_type=reauthenticate
 *
 * GOOGLE
 * → prompt=select_account
 *
 * KAKAO
 * → prompt=login
 *
 * 이 옵션들은 Memory Jar에서 로그아웃한 뒤
 * 브라우저에 남아 있는 소셜 로그인 세션 때문에
 * 원하지 않는 계정으로 바로 로그인되는 상황을 줄여준다.
 */
class SocialAuthorizationRequestResolverTest {

    // 이번 테스트에서 실제로 검사할 Resolver
    private SocialAuthorizationRequestResolver resolver;

    /*
     * 각 테스트 실행 전에
     * NAVER / GOOGLE / KAKAO용 가짜 ClientRegistration을 준비한다.
     *
     * 실제 Client ID / Client Secret은 절대 사용하지 않는다.
     */
    @BeforeEach
    void setUp() {

        /*
         * Spring Security가 OAuth Provider 설정을 찾을 수 있도록
         * 테스트용 ClientRegistration Repository를 만든다.
         */
        InMemoryClientRegistrationRepository clientRegistrationRepository =
                new InMemoryClientRegistrationRepository(
                        createClientRegistration(
                                "naver"
                        ),
                        createClientRegistration(
                                "google"
                        ),
                        createClientRegistration(
                                "kakao"
                        )
                );

        /*
         * 실제 운영 코드와 같은 Resolver를 만든다.
         */
        resolver =
                new SocialAuthorizationRequestResolver(
                        clientRegistrationRepository
                );
    }

    /*
     * NAVER 로그인 요청에는
     * auth_type=reauthenticate가 들어가야 한다.
     */
    @Test
    @DisplayName("NAVER 로그인 요청에는 auth_type=reauthenticate를 추가한다")
    void naver_addsReauthenticateParameter() {

        // when
        OAuth2AuthorizationRequest result =
                resolve(
                        "naver"
                );

        // then
        assertThat(
                result
        ).isNotNull();

        assertThat(
                result.getAdditionalParameters()
        ).containsEntry(
                "auth_type",
                "reauthenticate"
        );
    }

    /*
     * Google 로그인 요청에는
     * prompt=select_account가 들어가야 한다.
     */
    @Test
    @DisplayName("GOOGLE 로그인 요청에는 prompt=select_account를 추가한다")
    void google_addsSelectAccountParameter() {

        // when
        OAuth2AuthorizationRequest result =
                resolve(
                        "google"
                );

        // then
        assertThat(
                result
        ).isNotNull();

        assertThat(
                result.getAdditionalParameters()
        ).containsEntry(
                "prompt",
                "select_account"
        );
    }

    /*
     * 이번 Kakao 로그인 추가에서 중요한 테스트다.
     *
     * KAKAO 로그인 요청에는 prompt=login을 넣어서
     * 기존 카카오 로그인 세션이 있더라도
     * 카카오 인증 과정을 다시 거치게 한다.
     */
    @Test
    @DisplayName("KAKAO 로그인 요청에는 prompt=login을 추가한다")
    void kakao_addsLoginParameter() {

        // when
        OAuth2AuthorizationRequest result =
                resolve(
                        "kakao"
                );

        // then
        assertThat(
                result
        ).isNotNull();

        assertThat(
                result.getAdditionalParameters()
        ).containsEntry(
                "prompt",
                "login"
        );
    }

    /*
     * 원하는 Provider의 OAuth 요청을 만든다.
     *
     * 실제 브라우저 요청을 흉내 내는
     * MockHttpServletRequest를 사용한다.
     *
     * 외부 OAuth 서버로 실제 HTTP 요청은 보내지 않는다.
     */
    private OAuth2AuthorizationRequest resolve(
            String registrationId
    ) {

        String requestPath =
                "/oauth2/authorization/"
                        + registrationId;

        /*
         * 가짜 브라우저 GET 요청을 만든다.
         */
        MockHttpServletRequest request =
                new MockHttpServletRequest(
                        "GET",
                        requestPath
                );

        request.setServletPath(
                requestPath
        );

        /*
         * SocialAuthorizationRequestResolver의
         * 실제 resolve 로직을 실행한다.
         */
        return resolver.resolve(
                request
        );
    }

    /*
     * NAVER / GOOGLE / KAKAO 테스트에 사용할
     * 가짜 OAuth ClientRegistration을 만든다.
     *
     * 중요한 점:
     *
     * 아래 URL은 테스트에서 실제 호출되지 않는다.
     *
     * Spring Security가 OAuth 요청 객체를 만들 수 있도록
     * 구조만 맞춰주는 테스트용 설정이다.
     */
    private ClientRegistration createClientRegistration(
            String registrationId
    ) {

        return ClientRegistration
                .withRegistrationId(
                        registrationId
                )

                // 실제 Client ID가 아닌 테스트용 값
                .clientId(
                        "test-"
                                + registrationId
                                + "-client-id"
                )

                // 실제 Client Secret이 아닌 테스트용 값
                .clientSecret(
                        "test-"
                                + registrationId
                                + "-client-secret"
                )

                /*
                 * 테스트 목적은 인증 방법 자체가 아니라
                 * 추가 파라미터 검증이므로
                 * 일반적인 Client Secret 인증 방식을 사용한다.
                 */
                .clientAuthenticationMethod(
                        ClientAuthenticationMethod.CLIENT_SECRET_POST
                )

                // Memory Jar와 동일한 Authorization Code 방식
                .authorizationGrantType(
                        AuthorizationGrantType.AUTHORIZATION_CODE
                )

                // OAuth 성공 후 Spring으로 돌아올 주소
                .redirectUri(
                        "{baseUrl}/login/oauth2/code/{registrationId}"
                )

                /*
                 * 테스트용 scope.
                 *
                 * 이번 테스트에서는 scope 자체를 검사하는 것이 아니므로
                 * 공통 테스트 값을 사용한다.
                 */
                .scope(
                        "profile"
                )

                // 테스트용 OAuth 인증 서버 주소
                .authorizationUri(
                        "https://oauth.example.com/"
                                + registrationId
                                + "/authorize"
                )

                // 테스트용 Token 서버 주소
                .tokenUri(
                        "https://oauth.example.com/"
                                + registrationId
                                + "/token"
                )

                // 테스트용 사용자 정보 조회 주소
                .userInfoUri(
                        "https://oauth.example.com/"
                                + registrationId
                                + "/user"
                )

                // 테스트 사용자 고유 ID 필드 이름
                .userNameAttributeName(
                        "id"
                )

                // 화면 등에 사용할 테스트 Provider 이름
                .clientName(
                        registrationId.toUpperCase()
                )

                .build();
    }
}