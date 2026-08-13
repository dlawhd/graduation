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
 * NAVER 또는 GOOGLE 로그인이 성공한 뒤
 * Memory Jar의 실제 로그인 처리를 마무리하는 클래스야.
 *
 * 전체 흐름:
 *
 * 1. 어떤 OAuth Provider로 로그인했는지 확인
 * 2. NAVER / GOOGLE 사용자 정보를 각각의 형식에 맞게 읽기
 * 3. OAuth 계정을 Memory Jar User와 연결
 * 4. RefreshToken 발급
 * 5. AccessToken(JWT) 발급
 * 6. 토큰을 HttpOnly Cookie에 저장
 * 7. 프론트 로그인 성공 페이지로 이동
 *
 * 중요한 점:
 *
 * NAVER와 GOOGLE은 사용자 정보를 내려주는 모양이 다르지만
 * 최종적으로는 둘 다 UserService.findOrCreateOAuthUser()로 보내서
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
     * NAVER 또는 GOOGLE 로그인이 성공하면
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
         * NAVER와 GOOGLE은 사용자 정보 구조가 다르므로
         * Provider별로 알맞은 방법을 사용해서
         * 공통 OAuthProfile 형태로 바꾼다.
         */
        OAuthProfile profile =
                extractOAuthProfile(
                        registrationId,
                        attributes
                );

        /*
         * 방금 만든 UserService를 호출한다.
         *
         * 예:
         *
         * NAVER
         * NAVER + 네이버 id
         *
         * GOOGLE
         * GOOGLE + Google sub
         *
         * 이미 OAuth 계정 연결이 있으면 기존 User를 사용하고,
         * 연결 정보는 없지만 이메일이 같은 User가 있으면
         * 그 기존 User에게 새로운 OAuth 계정을 연결한다.
         */
        User user = userService.findOrCreateOAuthUser(
                profile.provider(),
                profile.providerId(),
                profile.email(),
                profile.name(),
                profile.birthyear()
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
         * NAVER로 로그인하든 GOOGLE로 로그인하든
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
     *       "name": "...",
     *       "birthyear": "..."
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

        // NAVER에서 받을 수 있는 출생연도
        String birthyear =
                getString(
                        naverAttributes.get("birthyear")
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
                name,
                birthyear
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
         * Google 기본 로그인에서는 birthyear를 요청하지 않는다.
         *
         * 기존 NAVER 회원이 Google 로그인으로 들어오더라도
         * User.updateProfile()은 null 값을 기존 birthyear에 덮어쓰지 않으므로
         * 기존 출생연도는 그대로 유지된다.
         */
        return new OAuthProfile(
                "GOOGLE",
                providerId,
                email,
                name,
                null
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
     * OAuthProfile 역할
     *
     * NAVER와 GOOGLE의 서로 다른 응답 형태를
     * UserService가 이해하기 쉬운 하나의 공통 모양으로 바꾼 객체야.
     *
     * 예:
     *
     * NAVER
     * → NAVER / id / email / name / birthyear
     *
     * GOOGLE
     * → GOOGLE / sub / email / name / null
     */
    private record OAuthProfile(
            String provider,
            String providerId,
            String email,
            String name,
            String birthyear
    ) {
    }
}