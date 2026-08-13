package shop.esjh.memoryjar.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.util.ReflectionTestUtils;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.service.AuthCookieService;
import shop.esjh.memoryjar.service.RefreshTokenService;
import shop.esjh.memoryjar.service.UserService;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/*
 * OAuth2SuccessHandlerTest 역할
 *
 * NAVER / GOOGLE 로그인이 성공했을 때
 * OAuth2SuccessHandler가 사용자 정보를 올바르게 읽고,
 *
 * 1. UserService에 전달하는지
 * 2. RefreshToken / AccessToken을 발급하는지
 * 3. 쿠키를 저장하는지
 * 4. 로그인 성공 페이지로 이동하는지
 *
 * 를 검증한다.
 *
 * 또한 잘못된 OAuth 사용자 정보가 들어왔을 때
 * 회원 생성이나 토큰 발급까지 진행하지 않는지도 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class OAuth2SuccessHandlerTest {

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @Mock
    private UserService userService;

    @Mock
    private RefreshTokenService refreshTokenService;

    @Mock
    private AuthCookieService authCookieService;

    private OAuth2SuccessHandler oAuth2SuccessHandler;

    /*
     * 각 테스트를 실행하기 전에
     * OAuth2SuccessHandler를 새로 만든다.
     */
    @BeforeEach
    void setUp() {

        oAuth2SuccessHandler = new OAuth2SuccessHandler(
                jwtTokenProvider,
                userService,
                refreshTokenService,
                authCookieService
        );

        /*
         * 실제 실행에서는 @Value가 application.yml 값을 넣어주지만,
         * 단위 테스트에서는 Spring Context를 띄우지 않기 때문에
         * 테스트용 프론트 주소를 직접 넣어준다.
         */
        ReflectionTestUtils.setField(
                oAuth2SuccessHandler,
                "frontendUrl",
                "https://www.esjh.shop"
        );
    }

    /*
     * 기존 NAVER 로그인도 Google 추가 후
     * 그대로 정상 동작하는지 확인한다.
     */
    @Test
    void onAuthenticationSuccess_네이버_로그인이_성공하면_토큰쿠키를_저장하고_리다이렉트한다()
            throws Exception {

        // given
        MockHttpServletRequest request =
                new MockHttpServletRequest();

        MockHttpServletResponse response =
                new MockHttpServletResponse();

        OAuth2AuthenticationToken authentication =
                mock(OAuth2AuthenticationToken.class);

        OAuth2User principal =
                mock(OAuth2User.class);

        /*
         * NAVER는 실제 사용자 정보가
         * response 안쪽에 들어오는 구조다.
         */
        Map<String, Object> naverResponse =
                new HashMap<>();

        naverResponse.put(
                "id",
                "naver-123"
        );

        naverResponse.put(
                "email",
                "user@example.com"
        );

        naverResponse.put(
                "name",
                "은서"
        );

        Map<String, Object> attributes =
                new HashMap<>();

        attributes.put(
                "response",
                naverResponse
        );

        /*
         * 이번 인증이 NAVER 로그인이라고 알려준다.
         */
        when(authentication.getAuthorizedClientRegistrationId())
                .thenReturn("naver");

        when(authentication.getPrincipal())
                .thenReturn(principal);

        when(principal.getAttributes())
                .thenReturn(attributes);

        /*
         * UserService가 최종적으로 반환한
         * Memory Jar User를 가짜로 만든다.
         */
        User user =
                mock(User.class);

        when(user.getId())
                .thenReturn(1L);

        when(user.getEmail())
                .thenReturn("user@example.com");

        when(user.getName())
                .thenReturn("은서");

        when(user.getBirthyear())
                .thenReturn("2000");

        /*
         * 이제 Naver 전용 메서드가 아니라
         * OAuth 공통 메서드를 호출해야 한다.
         */
        when(userService.findOrCreateOAuthUser(
                "NAVER",
                "naver-123",
                "user@example.com",
                "은서",
                null
        )).thenReturn(user);

        when(refreshTokenService.issue(user))
                .thenReturn("refresh-raw-token");

        when(jwtTokenProvider.createAccessToken(
                eq("1"),
                anyMap()
        )).thenReturn("access-jwt-token");

        // when
        oAuth2SuccessHandler.onAuthenticationSuccess(
                request,
                response,
                authentication
        );

        // then

        /*
         * NAVER 정보를 공통 OAuth 회원 서비스에
         * 정확하게 전달했는지 확인한다.
         */
        verify(userService).findOrCreateOAuthUser(
                "NAVER",
                "naver-123",
                "user@example.com",
                "은서",
                null
        );

        // RefreshToken 발급 확인
        verify(refreshTokenService)
                .issue(user);

        /*
         * JWT의 subject가 User ID인지,
         * DB User의 최신 정보가 claims에 들어갔는지 확인한다.
         */
        verify(jwtTokenProvider)
                .createAccessToken(
                        eq("1"),
                        argThat(claims ->
                                "user@example.com".equals(
                                        claims.get("email")
                                )
                                        &&
                                        "은서".equals(
                                                claims.get("name")
                                        )
                                        &&
                                        "2000".equals(
                                                claims.get("birthyear")
                                        )
                        )
                );

        // RefreshToken 쿠키 저장
        verify(authCookieService)
                .setRefreshCookie(
                        response,
                        "refresh-raw-token"
                );

        // AccessToken 쿠키 저장
        verify(authCookieService)
                .setAccessCookie(
                        response,
                        "access-jwt-token"
                );

        // 로그인 성공 페이지 이동
        assertThat(
                response.getRedirectedUrl()
        ).isEqualTo(
                "https://www.esjh.shop/login/success"
        );
    }

    /*
     * 새로 추가한 GOOGLE 로그인 성공 흐름을 검증한다.
     */
    @Test
    void onAuthenticationSuccess_구글_로그인이_성공하면_토큰쿠키를_저장하고_리다이렉트한다()
            throws Exception {

        // given
        MockHttpServletRequest request =
                new MockHttpServletRequest();

        MockHttpServletResponse response =
                new MockHttpServletResponse();

        OAuth2AuthenticationToken authentication =
                mock(OAuth2AuthenticationToken.class);

        OAuth2User principal =
                mock(OAuth2User.class);

        /*
         * Google은 NAVER와 달리
         * 사용자 정보가 최상위 attributes에 들어온다.
         */
        Map<String, Object> googleAttributes =
                new HashMap<>();

        googleAttributes.put(
                "sub",
                "google-sub-999"
        );

        googleAttributes.put(
                "email",
                "user@example.com"
        );

        googleAttributes.put(
                "email_verified",
                true
        );

        googleAttributes.put(
                "name",
                "은서"
        );

        /*
         * 이번 인증이 GOOGLE 로그인이라고 알려준다.
         */
        when(authentication.getAuthorizedClientRegistrationId())
                .thenReturn("google");

        when(authentication.getPrincipal())
                .thenReturn(principal);

        when(principal.getAttributes())
                .thenReturn(googleAttributes);

        /*
         * 예를 들어 이 사용자가 원래 NAVER 회원이었다면
         * DB에는 기존 birthyear가 남아 있을 수 있다.
         *
         * Handler는 OAuth 응답이 아니라
         * 최종 User 값을 JWT에 사용해야 한다.
         */
        User user =
                mock(User.class);

        when(user.getId())
                .thenReturn(1L);

        when(user.getEmail())
                .thenReturn("user@example.com");

        when(user.getName())
                .thenReturn("은서");

        when(user.getBirthyear())
                .thenReturn("2000");

        /*
         * Google 기본 로그인에는 birthyear가 없으므로
         * 마지막 인자는 null이다.
         */
        when(userService.findOrCreateOAuthUser(
                "GOOGLE",
                "google-sub-999",
                "user@example.com",
                "은서",
                null
        )).thenReturn(user);

        when(refreshTokenService.issue(user))
                .thenReturn("refresh-google-token");

        when(jwtTokenProvider.createAccessToken(
                eq("1"),
                anyMap()
        )).thenReturn("google-access-jwt");

        // when
        oAuth2SuccessHandler.onAuthenticationSuccess(
                request,
                response,
                authentication
        );

        // then

        /*
         * Google의 sub가 providerId로 전달되는지 확인한다.
         */
        verify(userService)
                .findOrCreateOAuthUser(
                        "GOOGLE",
                        "google-sub-999",
                        "user@example.com",
                        "은서",
                        null
                );

        verify(refreshTokenService)
                .issue(user);

        /*
         * Google에는 birthyear가 없더라도
         * 기존 DB User의 birthyear가 JWT에 유지되는지 확인한다.
         */
        verify(jwtTokenProvider)
                .createAccessToken(
                        eq("1"),
                        argThat(claims ->
                                "user@example.com".equals(
                                        claims.get("email")
                                )
                                        &&
                                        "은서".equals(
                                                claims.get("name")
                                        )
                                        &&
                                        "2000".equals(
                                                claims.get("birthyear")
                                        )
                        )
                );

        verify(authCookieService)
                .setRefreshCookie(
                        response,
                        "refresh-google-token"
                );

        verify(authCookieService)
                .setAccessCookie(
                        response,
                        "google-access-jwt"
                );

        assertThat(
                response.getRedirectedUrl()
        ).isEqualTo(
                "https://www.esjh.shop/login/success"
        );
    }

    /*
     * NAVER 응답에 사용자 고유 ID가 없으면
     * 로그인을 중단해야 한다.
     */
    @Test
    void onAuthenticationSuccess_네이버_ID가_없으면_로그인을_중단한다() {

        // given
        MockHttpServletRequest request =
                new MockHttpServletRequest();

        MockHttpServletResponse response =
                new MockHttpServletResponse();

        OAuth2AuthenticationToken authentication =
                mock(OAuth2AuthenticationToken.class);

        OAuth2User principal =
                mock(OAuth2User.class);

        Map<String, Object> naverResponse =
                new HashMap<>();

        // id는 일부러 넣지 않는다.
        naverResponse.put(
                "email",
                "user@example.com"
        );

        naverResponse.put(
                "name",
                "은서"
        );

        Map<String, Object> attributes =
                new HashMap<>();

        attributes.put(
                "response",
                naverResponse
        );

        when(authentication.getAuthorizedClientRegistrationId())
                .thenReturn("naver");

        when(authentication.getPrincipal())
                .thenReturn(principal);

        when(principal.getAttributes())
                .thenReturn(attributes);

        // when & then
        assertThatThrownBy(() ->
                oAuth2SuccessHandler
                        .onAuthenticationSuccess(
                                request,
                                response,
                                authentication
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "네이버 사용자 ID를 가져오지 못했습니다."
                );

        /*
         * 사용자 정보 검증 단계에서 실패했으므로
         * DB 회원 처리와 토큰 발급은 실행하면 안 된다.
         */
        verifyNoInteractions(userService);
        verifyNoInteractions(refreshTokenService);
        verifyNoInteractions(jwtTokenProvider);
        verifyNoInteractions(authCookieService);

        assertThat(
                response.getRedirectedUrl()
        ).isNull();
    }

    /*
     * GOOGLE의 고유 사용자 ID인 sub가 없으면
     * 로그인을 중단한다.
     */
    @Test
    void onAuthenticationSuccess_구글_sub가_없으면_로그인을_중단한다() {

        // given
        MockHttpServletRequest request =
                new MockHttpServletRequest();

        MockHttpServletResponse response =
                new MockHttpServletResponse();

        OAuth2AuthenticationToken authentication =
                mock(OAuth2AuthenticationToken.class);

        OAuth2User principal =
                mock(OAuth2User.class);

        Map<String, Object> googleAttributes =
                new HashMap<>();

        // sub는 일부러 넣지 않는다.
        googleAttributes.put(
                "email",
                "user@example.com"
        );

        googleAttributes.put(
                "email_verified",
                true
        );

        googleAttributes.put(
                "name",
                "은서"
        );

        when(authentication.getAuthorizedClientRegistrationId())
                .thenReturn("google");

        when(authentication.getPrincipal())
                .thenReturn(principal);

        when(principal.getAttributes())
                .thenReturn(googleAttributes);

        // when & then
        assertThatThrownBy(() ->
                oAuth2SuccessHandler
                        .onAuthenticationSuccess(
                                request,
                                response,
                                authentication
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "Google 사용자 ID를 가져오지 못했습니다."
                );

        verifyNoInteractions(userService);
        verifyNoInteractions(refreshTokenService);
        verifyNoInteractions(jwtTokenProvider);
        verifyNoInteractions(authCookieService);

        assertThat(
                response.getRedirectedUrl()
        ).isNull();
    }

    /*
     * Google이 확인하지 않은 이메일이라면
     * 기존 회원에게 자동 연결하지 않도록 로그인 자체를 중단한다.
     */
    @Test
    void onAuthenticationSuccess_구글_이메일이_검증되지_않았으면_로그인을_중단한다() {

        // given
        MockHttpServletRequest request =
                new MockHttpServletRequest();

        MockHttpServletResponse response =
                new MockHttpServletResponse();

        OAuth2AuthenticationToken authentication =
                mock(OAuth2AuthenticationToken.class);

        OAuth2User principal =
                mock(OAuth2User.class);

        Map<String, Object> googleAttributes =
                new HashMap<>();

        googleAttributes.put(
                "sub",
                "google-sub-999"
        );

        googleAttributes.put(
                "email",
                "user@example.com"
        );

        /*
         * Google이 이메일을 확인하지 않은 상태라고 가정한다.
         */
        googleAttributes.put(
                "email_verified",
                false
        );

        googleAttributes.put(
                "name",
                "은서"
        );

        when(authentication.getAuthorizedClientRegistrationId())
                .thenReturn("google");

        when(authentication.getPrincipal())
                .thenReturn(principal);

        when(principal.getAttributes())
                .thenReturn(googleAttributes);

        // when & then
        assertThatThrownBy(() ->
                oAuth2SuccessHandler
                        .onAuthenticationSuccess(
                                request,
                                response,
                                authentication
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "확인되지 않은 Google 이메일입니다."
                );

        verifyNoInteractions(userService);
        verifyNoInteractions(refreshTokenService);
        verifyNoInteractions(jwtTokenProvider);
        verifyNoInteractions(authCookieService);

        assertThat(
                response.getRedirectedUrl()
        ).isNull();
    }

    /*
     * Memory Jar가 아직 지원하지 않는 OAuth Provider가
     * 들어왔을 때도 안전하게 막는지 확인한다.
     */
    @Test
    void onAuthenticationSuccess_지원하지_않는_Provider면_로그인을_중단한다() {

        // given
        MockHttpServletRequest request =
                new MockHttpServletRequest();

        MockHttpServletResponse response =
                new MockHttpServletResponse();

        OAuth2AuthenticationToken authentication =
                mock(OAuth2AuthenticationToken.class);

        OAuth2User principal =
                mock(OAuth2User.class);

        when(authentication.getAuthorizedClientRegistrationId())
                .thenReturn("unknown-provider");

        when(authentication.getPrincipal())
                .thenReturn(principal);

        when(principal.getAttributes())
                .thenReturn(
                        Map.of()
                );

        // when & then
        assertThatThrownBy(() ->
                oAuth2SuccessHandler
                        .onAuthenticationSuccess(
                                request,
                                response,
                                authentication
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "지원하지 않는 OAuth2 Provider입니다: unknown-provider"
                );

        verifyNoInteractions(userService);
        verifyNoInteractions(refreshTokenService);
        verifyNoInteractions(jwtTokenProvider);
        verifyNoInteractions(authCookieService);

        assertThat(
                response.getRedirectedUrl()
        ).isNull();
    }
}