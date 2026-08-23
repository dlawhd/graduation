package shop.esjh.memoryjar.auth;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.service.AuthCookieService;
import shop.esjh.memoryjar.service.RefreshTokenService;
import shop.esjh.memoryjar.service.UserService;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/*
 * OAuth2SuccessHandler 역할
 *
 * NAVER / GOOGLE / KAKAO 로그인이 성공한 뒤
 * Memory Jar의 실제 로그인 처리를 마무리하는 클래스야.
 *
 * 각 소셜 로그인 회사는 사용자 정보를 서로 다른 모양으로 내려준다.
 *
 * 예:
 *
 * NAVER
 * → response.id / response.email / response.name
 *
 * GOOGLE
 * → sub / email / email_verified / name
 *
 * KAKAO
 * → id / kakao_account.email / kakao_account.profile.nickname
 *
 * 이 클래스는 이렇게 서로 다른 응답을
 * Memory Jar에서 사용하는 하나의 OAuthProfile 형태로 바꿔준다.
 *
 * 전체 흐름:
 *
 * 1. 어떤 OAuth Provider로 로그인했는지 확인
 * 2. NAVER / GOOGLE / KAKAO 사용자 정보를 각 형식에 맞게 읽기
 * 3. 공통 OAuthProfile로 변환
 * 4. OAuth 계정을 Memory Jar User와 연결
 * 5. RefreshToken 발급
 * 6. AccessToken(JWT) 발급
 * 7. 토큰을 HttpOnly Cookie에 저장
 * 8. 프론트 로그인 성공 페이지로 이동
 *
 * 중요한 점:
 *
 * 소셜 로그인 회사가 달라도
 * 최종적으로는 모두 UserService.findOrCreateOAuthUser()로 보내므로
 * 같은 Memory Jar 회원 체계를 사용한다.
 */
@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    // AccessToken(JWT)을 만드는 도구
    private final JwtTokenProvider jwtTokenProvider;

    // OAuth 계정을 Memory Jar User와 연결하는 서비스
    private final UserService userService;

    // RefreshToken을 발급하고 DB에 저장하는 서비스
    private final RefreshTokenService refreshTokenService;

    // AccessToken / RefreshToken을 쿠키에 저장하는 서비스
    private final AuthCookieService authCookieService;

    /*
     * 로그인 성공 후 이동할 프론트 주소
     *
     * 로컬:
     * http://localhost:3000
     *
     * 배포:
     * https://www.esjh.shop
     */
    @Value("${app.frontend-url}")
    private String frontendUrl;

    /*
     * OAuth 로그인 완료 처리에 필요한 객체들을
     * Spring이 생성자에 자동으로 넣어준다.
     */
    public OAuth2SuccessHandler(
            JwtTokenProvider jwtTokenProvider,
            UserService userService,
            RefreshTokenService refreshTokenService,
            AuthCookieService authCookieService
    ) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.userService = userService;
        this.refreshTokenService = refreshTokenService;
        this.authCookieService = authCookieService;
    }

    /*
     * NAVER / GOOGLE / KAKAO 로그인이 성공하면
     * Spring Security가 자동으로 호출하는 메서드야.
     */
    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException, ServletException {

        /*
         * 이 SuccessHandler는 OAuth 로그인 성공 처리용이므로
         * OAuth2AuthenticationToken인지 먼저 확인한다.
         */
        if (!(authentication instanceof OAuth2AuthenticationToken token)) {
            throw new IllegalArgumentException(
                    "OAuth2 로그인 인증 정보를 가져오지 못했습니다."
            );
        }

        /*
         * registrationId는 어떤 로그인 Provider를 사용했는지 알려준다.
         *
         * 예:
         *
         * /oauth2/authorization/naver
         * → registrationId = "naver"
         *
         * /oauth2/authorization/google
         * → registrationId = "google"
         */
        String registrationId =
                token.getAuthorizedClientRegistrationId();

        // OAuth Provider가 내려준 원본 사용자 정보
        Map<String, Object> attributes =
                token.getPrincipal().getAttributes();

        /*
         * NAVER / GOOGLE / KAKAO는 사용자 정보 구조가 서로 다르므로
         * Provider별 전용 메서드로 읽은 뒤
         * 공통 OAuthProfile 형태로 바꾼다.
         */
        OAuthProfile profile =
                extractOAuthProfile(
                        registrationId,
                        attributes
                );

        /*
         * NAVER / GOOGLE / KAKAO 모두
         * 현재 출생연도를 OAuth 로그인에서 새로 받지 않는다.
         * UserService의 기존 메서드 구조는 그대로 유지하되,
         * birthyear 자리에는 null을 전달한다.
         *
         * 기존 DB에 저장되어 있는 birthyear 값이 있다면
         * User.updateProfile()에서 null로 덮어쓰지 않기 때문에 그대로 유지된다.
         */
        User user = userService.findOrCreateOAuthUser(
                profile.provider(),
                profile.providerId(),
                profile.email(),
                profile.name(),
                null
        );

        /*
         * RefreshToken을 발급한다.
         *
         * 브라우저에는 원본 RefreshToken을 저장하고
         * DB에는 RefreshTokenService 정책에 따라 안전하게 관리한다.
         */
        String refreshRaw =
                refreshTokenService.issue(user);

        /*
         * JWT subject는 Memory Jar의 User ID다.
         *
         * NAVER / GOOGLE / KAKAO 중 어떤 방식으로 로그인하더라도
         * 같은 User라면 동일한 userId를 사용한다.
         */
        String subject =
                String.valueOf(user.getId());

        /*
         * JWT에 넣을 추가 사용자 정보를 만든다.
         *
         * 여기서는 OAuth Provider가 방금 내려준 값을 그대로 사용하지 않고
         * UserService 처리가 끝난 뒤의 User 정보를 사용한다.
         *
         * 이유:
         *
         * 기존 NAVER 회원이 GOOGLE로 로그인하면
         * Google에는 birthyear가 없지만
         * DB에는 기존 NAVER birthyear가 남아 있을 수 있기 때문이다.
         */
        Map<String, Object> claims =
                new HashMap<>();

        // DB에 최종 저장된 이메일을 JWT에 넣는다.
        if (StringUtils.hasText(user.getEmail())) {
            claims.put(
                    "email",
                    user.getEmail()
            );
        }

        /*
         * 이름이 없으면 화면에서 null 대신
         * "사용자"라는 기본 이름을 사용한다.
         */
        String safeName =
                StringUtils.hasText(user.getName())
                        ? user.getName()
                        : "사용자";

        claims.put(
                "name",
                safeName
        );

        /*
         * birthyear는 선택값이다.
         *
         * Google 기본 로그인에서는 birthyear를 받지 않기 때문에
         * 값이 존재할 때만 JWT에 넣는다.
         */
        if (StringUtils.hasText(user.getBirthyear())) {
            claims.put(
                    "birthyear",
                    user.getBirthyear()
            );
        }

        /*
         * AccessToken을 발급한다.
         *
         * 이 토큰이 이후 Memory Jar API 요청에서
         * "현재 로그인한 사용자가 누구인지" 증명하는 역할을 한다.
         */
        String jwt =
                jwtTokenProvider.createAccessToken(
                        subject,
                        claims
                );

        // RefreshToken 쿠키 저장
        authCookieService.setRefreshCookie(
                response,
                refreshRaw
        );

        // AccessToken 쿠키 저장
        authCookieService.setAccessCookie(
                response,
                jwt
        );

        /*
         * OAuth 로그인부터 Memory Jar 토큰 발급까지 모두 끝났으므로
         * 프론트의 기존 로그인 성공 페이지로 이동한다.
         */
        response.sendRedirect(
                frontendUrl + "/login/success"
        );
    }

    /*
     * 어떤 OAuth Provider인지 확인한 뒤
     * Provider별 사용자 정보 추출 메서드로 보내준다.
     */
    private OAuthProfile extractOAuthProfile(
            String registrationId,
            Map<String, Object> attributes
    ) {

        if (!StringUtils.hasText(registrationId)) {
            throw new IllegalArgumentException(
                    "OAuth2 Provider 정보를 가져오지 못했습니다."
            );
        }

        return switch (registrationId.toLowerCase()) {

            // NAVER 사용자 정보 읽기
            case "naver" ->
                    extractNaverProfile(attributes);

            // GOOGLE 사용자 정보 읽기
            case "google" ->
                    extractGoogleProfile(attributes);

            /*
             * KAKAO 사용자 정보 읽기
             */
            case "kakao" ->
                    extractKakaoProfile(attributes);

            // 현재 지원하지 않는 OAuth 로그인
            default ->
                    throw new IllegalArgumentException(
                            "지원하지 않는 OAuth2 Provider입니다: "
                                    + registrationId
                    );
        };
    }

    /*
     * NAVER 사용자 정보를 읽는다.
     *
     * NAVER 응답은 보통 다음처럼 한 단계 안쪽에 실제 정보가 있다.
     *
     * {
     *   "resultcode": "00",
     *   "message": "success",
     *   "response": {
     *       "id": "...",
     *       "email": "...",
     *       "name": "..."
     *   }
     * }
     */
    private OAuthProfile extractNaverProfile(
            Map<String, Object> attributes
    ) {

        /*
         * response 안에 실제 NAVER 사용자 정보가 있는지 확인한다.
         *
         * Map<?, ?>로 받아서 기존 코드의 강제 형변환 경고도 없앤다.
         */
        Object response =
                attributes.get("response");

        if (!(response instanceof Map<?, ?> naverAttributes)) {
            throw new IllegalArgumentException(
                    "네이버 사용자 정보를 가져오지 못했습니다."
            );
        }

        // NAVER 애플리케이션에서 사용하는 사용자 고유 ID
        String providerId =
                getString(
                        naverAttributes.get("id")
                );

        // 사용자가 동의한 NAVER 이메일
        String email =
                getString(
                        naverAttributes.get("email")
                );

        // 사용자 이름
        String name =
                getString(
                        naverAttributes.get("name")
                );

        // 고유 ID가 없다면 사용자 구분이 불가능하므로 중단
        if (!StringUtils.hasText(providerId)) {
            throw new IllegalArgumentException(
                    "네이버 사용자 ID를 가져오지 못했습니다."
            );
        }

        /*
         * 현재 Memory Jar에서는
         * 기존 User와 OAuth 계정을 연결할 때 이메일이 필요하다.
         */
        if (!StringUtils.hasText(email)) {
            throw new IllegalArgumentException(
                    "네이버 이메일을 가져오지 못했습니다."
            );
        }

        return new OAuthProfile(
                "NAVER",
                providerId,
                email,
                name
        );
    }

    /*
     * GOOGLE 사용자 정보를 읽는다.
     *
     * Google은 NAVER와 달리 response 안쪽이 아니라
     * attributes 최상위에 사용자 정보가 들어온다.
     *
     * 우리가 사용하는 대표 값:
     *
     * sub
     * email
     * email_verified
     * name
     */
    private OAuthProfile extractGoogleProfile(
            Map<String, Object> attributes
    ) {

        /*
         * Google의 sub는 Google 사용자를 구분하는
         * 고유 식별값이다.
         */
        String providerId =
                getString(
                        attributes.get("sub")
                );

        // Google 계정 이메일
        String email =
                getString(
                        attributes.get("email")
                );

        // Google 프로필 이름
        String name =
                getString(
                        attributes.get("name")
                );

        /*
         * Google이 이 이메일을 확인했는지 나타내는 값이다.
         *
         * 우리는 같은 이메일의 기존 NAVER 회원에게
         * GOOGLE 계정을 자동 연결할 수 있기 때문에
         * 검증된 Google 이메일만 허용한다.
         */
        boolean emailVerified =
                Boolean.TRUE.equals(
                        attributes.get("email_verified")
                );

        // sub가 없다면 Google 사용자를 안전하게 구분할 수 없다.
        if (!StringUtils.hasText(providerId)) {
            throw new IllegalArgumentException(
                    "Google 사용자 ID를 가져오지 못했습니다."
            );
        }

        // 이메일이 없다면 기존 Memory Jar 회원 연결을 진행할 수 없다.
        if (!StringUtils.hasText(email)) {
            throw new IllegalArgumentException(
                    "Google 이메일을 가져오지 못했습니다."
            );
        }

        /*
         * 이메일 기반 자동 계정 연결을 사용하므로
         * Google이 검증한 이메일인지 확인한다.
         */
        if (!emailVerified) {
            throw new IllegalArgumentException(
                    "확인되지 않은 Google 이메일입니다."
            );
        }

        /*
         * Google에서도 현재 Memory Jar에 필요한
         * 사용자 식별값, 이메일, 이름만 사용한다.
         */
        return new OAuthProfile(
                "GOOGLE",
                providerId,
                email,
                name
        );
    }

    /*
     * KAKAO 사용자 정보를 읽는다.
     *
     * Kakao는 NAVER / GOOGLE과 사용자 정보 구조가 다르다.
     *
     * 대표적인 Kakao 사용자 정보 응답은 다음과 같은 모양이다.
     *
     * {
     *   "id": 123456789,
     *   "kakao_account": {
     *     "profile": {
     *       "nickname": "은서"
     *     },
     *     "email": "user@example.com",
     *     "is_email_valid": true,
     *     "is_email_verified": true
     *   }
     * }
     *
     * Memory Jar에서는 다음 정보만 사용한다.
     *
     * id
     * → Kakao 사용자의 고유 식별값
     *
     * kakao_account.email
     * → 기존 Memory Jar 회원과 연결할 이메일
     *
     * kakao_account.is_email_valid
     * → 현재 사용할 수 있는 이메일인지 확인
     *
     * kakao_account.is_email_verified
     * → Kakao가 인증한 이메일인지 확인
     *
     * kakao_account.profile.nickname
     * → Memory Jar에서 사용할 사용자 이름
     */
    private OAuthProfile extractKakaoProfile(
            Map<String, Object> attributes
    ) {

        /*
         * Kakao의 사용자 ID는 문자열이 아니라
         * Long 같은 숫자 타입으로 내려올 수 있다.
         *
         * 기존 getString()은 String만 읽을 수 있으므로
         * Kakao ID는 아래에서 추가할 getIdentifierString()을 사용한다.
         *
         * 예:
         *
         * 123456789L
         * ↓
         * "123456789"
         */
        String providerId =
                getIdentifierString(
                        attributes.get("id")
                );

        /*
         * 이메일과 프로필은
         * 최상위가 아니라 kakao_account 안에 들어 있다.
         */
        Object kakaoAccountValue =
                attributes.get("kakao_account");

        /*
         * kakao_account 자체가 없다면
         * 필요한 사용자 정보를 가져올 수 없으므로 로그인을 중단한다.
         */
        if (!(kakaoAccountValue instanceof Map<?, ?> kakaoAccount)) {
            throw new IllegalArgumentException(
                    "카카오 계정 정보를 가져오지 못했습니다."
            );
        }

        // 사용자가 동의한 카카오계정 대표 이메일
        String email =
                getString(
                        kakaoAccount.get("email")
                );

        /*
         * 카카오가 알려주는 이메일 유효 여부다.
         *
         * true
         * → 현재 사용할 수 있는 이메일
         *
         * false
         * → 유효하지 않은 이메일
         */
        boolean emailValid =
                Boolean.TRUE.equals(
                        kakaoAccount.get("is_email_valid")
                );

        /*
         * 카카오에서 이메일 인증이 끝난 계정인지 확인한다.
         *
         * Memory Jar는 같은 이메일을 기준으로
         * 기존 NAVER / GOOGLE 사용자와 OAuth 계정을 자동 연결할 수 있으므로
         * 검증된 이메일만 사용한다.
         */
        boolean emailVerified =
                Boolean.TRUE.equals(
                        kakaoAccount.get("is_email_verified")
                );

        /*
         * Kakao 닉네임은
         *
         * kakao_account
         *   └── profile
         *         └── nickname
         *
         * 구조로 들어 있다.
         */
        String name = null;

        Object profileValue =
                kakaoAccount.get("profile");

        if (profileValue instanceof Map<?, ?> profile) {
            name =
                    getString(
                            profile.get("nickname")
                    );
        }

        /*
         * Kakao 회원번호가 없다면
         * 어떤 Kakao 사용자인지 구분할 수 없으므로 로그인하지 않는다.
         */
        if (!StringUtils.hasText(providerId)) {
            throw new IllegalArgumentException(
                    "카카오 사용자 ID를 가져오지 못했습니다."
            );
        }

        /*
         * 현재 Memory Jar는 이메일을 기준으로
         * 기존 소셜 로그인 회원과 계정을 연결하기 때문에
         * 이메일이 반드시 필요하다.
         */
        if (!StringUtils.hasText(email)) {
            throw new IllegalArgumentException(
                    "카카오 이메일을 가져오지 못했습니다."
            );
        }

        /*
         * 유효하지 않은 이메일을 기존 회원과 연결하면 안 되므로
         * Kakao가 유효하다고 확인한 이메일만 허용한다.
         */
        if (!emailValid) {
            throw new IllegalArgumentException(
                    "유효하지 않은 카카오 이메일입니다."
            );
        }

        /*
         * 이메일 기반 자동 계정 연결은 보안에 중요한 작업이므로
         * Kakao에서 인증이 완료된 이메일만 사용한다.
         */
        if (!emailVerified) {
            throw new IllegalArgumentException(
                    "확인되지 않은 카카오 이메일입니다."
            );
        }

        /*
         * 이제 NAVER / GOOGLE과 동일한 OAuthProfile 형태로 만들어
         * 기존 UserService에 그대로 전달한다.
         */
        return new OAuthProfile(
                "KAKAO",
                providerId,
                email,
                name
        );
    }


    /*
     * OAuth 응답 값이 String인지 안전하게 확인해서 꺼낸다.
     *
     * 값이 없거나 String이 아니면 null을 반환한다.
     */
    private String getString(Object value) {

        if (value instanceof String text) {
            return text;
        }

        return null;
    }

    /*
     * OAuth Provider의 사용자 고유 ID를
     * Memory Jar에서 사용할 String 형태로 안전하게 바꾼다.
     *
     * Provider마다 사용자 ID의 자료형이 다를 수 있다.
     *
     * NAVER / GOOGLE
     * → 보통 String
     *
     * KAKAO
     * → Long 같은 Number 타입으로 내려올 수 있음
     *
     * DB의 UserOAuthAccount.providerId는 String으로 관리하므로
     * 두 경우를 모두 String으로 통일한다.
     */
    private String getIdentifierString(Object value) {

        // 이미 문자열이라면 그대로 사용한다.
        if (value instanceof String text) {
            return text;
        }

        /*
         * Kakao처럼 숫자로 내려온 사용자 ID는
         * 문자열로 변환한다.
         *
         * 예:
         *
         * 123456789L
         * ↓
         * "123456789"
         */
        if (value instanceof Number number) {
            return String.valueOf(
                    number
            );
        }

        // 지원하지 않는 타입이거나 값이 없으면 null
        return null;
    }

    /*
     * OAuthProfile 역할
     *
     * NAVER / GOOGLE / KAKAO의 서로 다른 사용자 정보 응답을
     * UserService가 이해하기 쉬운 하나의 공통 모양으로 바꾼 객체야.
     *
     * OAuth Provider마다 응답 JSON의 구조는 다르지만,
     * 이 객체를 만든 뒤부터는 UserService가 Provider별 JSON 구조를
     * 알 필요가 없다.
     *
     * Memory Jar에서 OAuth 로그인에 실제로 사용하는 정보만 담는다.
     *
     * 예:
     *
     * NAVER
     * → NAVER / id / email / name
     *
     * GOOGLE
     * → GOOGLE / sub / email / name
     *
     * KAKAO
     * → KAKAO / id / email / nickname
     *
     * birthyear는 현재 OAuth Provider에서 새로 요청하지 않으며,
     * 기존 User에 저장되어 있는 값이 있다면 그대로 유지한다.
     */
    private record OAuthProfile(
            String provider,
            String providerId,
            String email,
            String name
    ) {
    }
}