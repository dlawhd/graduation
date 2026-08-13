package shop.esjh.memoryjar.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import java.util.HashMap;
import java.util.Map;

/*
 * SocialAuthorizationRequestResolver 역할
 *
 * NAVER / Google 로그인 요청을 각 Provider에 맞게 꾸며주는 클래스다.
 *
 * Spring Security가 기본 OAuth2 로그인 요청을 먼저 만든 뒤,
 * 로그인 대상에 따라 필요한 추가 파라미터만 붙여준다.
 *
 * NAVER:
 * - auth_type=reauthenticate
 * - 네이버에 로그인되어 있어도 다시 인증 화면을 보여준다.
 *
 * Google:
 * - prompt=select_account
 * - 이전 Google 계정으로 바로 자동 로그인하지 않고
 *   매번 계정 선택 화면을 먼저 보여준다.
 *
 * 그 외 Provider:
 * - Spring Security가 만든 기본 요청을 그대로 사용한다.
 */
public class SocialAuthorizationRequestResolver
        implements OAuth2AuthorizationRequestResolver {

    /*
     * Spring Security가 원래 사용하던 기본 Resolver다.
     *
     * 우리가 OAuth 요청 전체를 직접 만드는 것이 아니라,
     * Spring이 안전하게 만들어준 요청을 받아서
     * 필요한 부분만 조금 수정한다.
     */
    private final OAuth2AuthorizationRequestResolver defaultResolver;

    /*
     * /oauth2/authorization/{registrationId}
     *
     * 형태의 OAuth 로그인 시작 주소를 처리하는
     * 기본 Resolver를 준비한다.
     */
    public SocialAuthorizationRequestResolver(
            ClientRegistrationRepository clientRegistrationRepository
    ) {
        this.defaultResolver =
                new DefaultOAuth2AuthorizationRequestResolver(
                        clientRegistrationRepository,
                        "/oauth2/authorization"
                );
    }

    /*
     * 사용자가 예를 들어
     *
     * /oauth2/authorization/naver
     * /oauth2/authorization/google
     *
     * 로 들어왔을 때 호출된다.
     */
    @Override
    public OAuth2AuthorizationRequest resolve(
            HttpServletRequest request
    ) {

        // Spring Security가 먼저 기본 OAuth 요청을 만든다.
        OAuth2AuthorizationRequest originalRequest =
                defaultResolver.resolve(request);

        // 로그인 Provider에 맞는 추가 설정을 붙인다.
        return customize(originalRequest);
    }

    /*
     * Spring Security 내부에서 registrationId를
     * 직접 넘겨주는 경우 사용하는 메서드다.
     */
    @Override
    public OAuth2AuthorizationRequest resolve(
            HttpServletRequest request,
            String clientRegistrationId
    ) {

        // Spring Security 기본 OAuth 요청 생성
        OAuth2AuthorizationRequest originalRequest =
                defaultResolver.resolve(
                        request,
                        clientRegistrationId
                );

        // 로그인 Provider에 맞게 꾸민다.
        return customize(originalRequest);
    }

    /*
     * OAuth 로그인 Provider에 따라
     * 추가 파라미터를 붙여준다.
     */
    private OAuth2AuthorizationRequest customize(
            OAuth2AuthorizationRequest originalRequest
    ) {

        /*
         * Spring이 OAuth 요청을 만들지 못했다면
         * 더 이상 수정할 것도 없으므로 그대로 반환한다.
         */
        if (originalRequest == null) {
            return null;
        }

        /*
         * 현재 로그인 대상이 누구인지 확인한다.
         *
         * 값 예:
         * - naver
         * - google
         */
        String registrationId =
                originalRequest.getAttribute(
                        "registration_id"
                );

        /*
         * 기존 OAuth 추가 파라미터를 복사한다.
         *
         * 기존 값을 버리지 않고
         * 우리가 필요한 값만 추가하기 위해서다.
         */
        Map<String, Object> extraParams =
                new HashMap<>(
                        originalRequest.getAdditionalParameters()
                );

        /*
         * NAVER 로그인
         *
         * auth_type=reauthenticate를 전달해서
         * 이미 네이버에 로그인되어 있더라도
         * 다시 인증 화면을 거치도록 한다.
         */
        if ("naver".equals(registrationId)) {
            extraParams.put(
                    "auth_type",
                    "reauthenticate"
            );
        }

        /*
         * Google 로그인
         *
         * prompt=select_account를 전달하면
         * 브라우저에 이전 Google 로그인 세션이 남아 있어도
         * 특정 계정으로 바로 Memory Jar에 로그인하지 않고
         * 먼저 Google 계정 선택 화면을 보여준다.
         */
        else if ("google".equals(registrationId)) {
            extraParams.put(
                    "prompt",
                    "select_account"
            );
        }

        /*
         * NAVER / Google 외의 OAuth Provider라면
         * 별도로 수정할 내용이 없으므로
         * Spring이 만든 요청을 그대로 반환한다.
         */
        else {
            return originalRequest;
        }

        /*
         * 기존 OAuth 요청의 clientId, redirectUri,
         * scope, state 등의 중요한 값은 그대로 유지하고
         * additionalParameters만 변경해서 새 요청을 만든다.
         */
        return OAuth2AuthorizationRequest
                .from(originalRequest)
                .additionalParameters(extraParams)
                .build();
    }
}