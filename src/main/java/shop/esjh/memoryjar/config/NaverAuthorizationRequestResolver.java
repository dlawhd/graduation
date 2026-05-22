package shop.esjh.memoryjar.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import java.util.HashMap;
import java.util.Map;

// ------------------------------------------------------------
// 네이버 로그인 요청을 꾸며주는 클래스
// - 기본 Spring Security OAuth2 요청을 그대로 사용하면서
// - 네이버 로그인일 때만 auth_type=reauthenticate 를 추가해요.
// ------------------------------------------------------------
public class NaverAuthorizationRequestResolver implements OAuth2AuthorizationRequestResolver {

    // Spring Security가 기본으로 쓰는 resolver
    private final OAuth2AuthorizationRequestResolver defaultResolver;

    // "/oauth2/authorization/{registrationId}" 패턴을 처리하는 기본 resolver 생성
    public NaverAuthorizationRequestResolver(ClientRegistrationRepository clientRegistrationRepository) {
        this.defaultResolver =
                new DefaultOAuth2AuthorizationRequestResolver(
                        clientRegistrationRepository,
                        "/oauth2/authorization"
                );
    }

    // ------------------------------------------------------------
    // 사용자가 /oauth2/authorization/naver 로 들어왔을 때 호출되는 메서드
    // ------------------------------------------------------------
    @Override
    public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
        OAuth2AuthorizationRequest originalRequest = defaultResolver.resolve(request);
        return customizeIfNaver(originalRequest);
    }

    // ------------------------------------------------------------
    // 내부적으로 registrationId가 명시된 경우 호출되는 메서드
    // ------------------------------------------------------------
    @Override
    public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String clientRegistrationId) {
        OAuth2AuthorizationRequest originalRequest =
                defaultResolver.resolve(request, clientRegistrationId);
        return customizeIfNaver(originalRequest);
    }

    // ------------------------------------------------------------
    // 네이버 로그인 요청일 때 auth_type=reauthenticate 추가
    // ------------------------------------------------------------
    private OAuth2AuthorizationRequest customizeIfNaver(OAuth2AuthorizationRequest originalRequest) {
        // 요청이 없으면 그대로 null
        if (originalRequest == null) {
            return null;
        }

        // 현재 로그인 대상이 네이버가 아니면 그대로 반환
        String registrationId = originalRequest.getAttribute("registration_id");
        if (!"naver".equals(registrationId)) {
            return originalRequest;
        }

        // 기존 추가 파라미터 복사
        Map<String, Object> extraParams = new HashMap<>(originalRequest.getAdditionalParameters());

        // 네이버 재인증 파라미터 추가
        // 이렇게 하면 이미 네이버 로그인 상태여도 다시 로그인 화면을 요구해요.
        extraParams.put("auth_type", "reauthenticate");

        // 기존 요청을 복사해서 추가 파라미터만 덮어쓰기
        return OAuth2AuthorizationRequest.from(originalRequest)
                .additionalParameters(extraParams)
                .build();
    }
}