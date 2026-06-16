package shop.esjh.memoryjar.auth;

import org.springframework.util.StringUtils;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.service.AuthCookieService;
import shop.esjh.memoryjar.service.UserService;
import shop.esjh.memoryjar.service.RefreshTokenService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

// 네이버 로그인이 성공하면 이 클래스가 자동으로 불려서 우리 서비스에 필요한 로그인 후처리를 한다.
@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    // ✅ AccessToken(JWT) 만드는 도구
    private final JwtTokenProvider jwtTokenProvider;

    // ✅ 네이버로 받은 사용자 정보를 "우리 DB 회원"으로 저장/조회하는 서비스
    private final UserService userService;

    // ✅ RefreshToken(재발급용 토큰)을 발급하고 DB에 저장하는 서비스
    private final RefreshTokenService refreshTokenService;

    // ✅ accessToken / refreshToken 쿠키를 브라우저에 저장해주는 서비스
    private final AuthCookieService authCookieService;

    // ✅ 로그인 성공 후 프론트로 보내줄 주소(예: https://www.esjh.shop)
    @Value("${app.frontend-url}")
    private String frontendUrl;

    // ✅ 필요한 도구들을 스프링이 자동으로 넣어줌(주입)
    public OAuth2SuccessHandler(JwtTokenProvider jwtTokenProvider,
                                UserService userService,
                                RefreshTokenService refreshTokenService,
                                AuthCookieService authCookieService) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.userService = userService;
        this.refreshTokenService = refreshTokenService;
        this.authCookieService = authCookieService;
    }

    /**
     * ✅ 네이버 로그인이 성공하면 스프링 시큐리티가 자동으로 이 메서드를 호출
     * 흐름:
     * 1. 네이버가 준 사용자 정보 꺼내기
     * 2. 우리 DB 회원 조회/생성
     * 3. refreshToken 발급
     * 4. accessToken 발급
     * 5. 토큰을 쿠키로 저장
     * 6. 프론트 로그인 성공 페이지로 이동
     */
    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException, ServletException {

        // ✅ 네이버 로그인 결과를 꺼내기 위해 OAuth2AuthenticationToken으로 변환
        OAuth2AuthenticationToken token = (OAuth2AuthenticationToken) authentication;

        // ✅ 네이버에서 내려준 사용자 정보(속성들) 가져오기
        Map<String, Object> attributes = token.getPrincipal().getAttributes();

        /**
         * ✅ 네이버는 user-name-attribute를 response로 잡아서
         * attributes 안에 response라는 키가 있고, 그 안에 진짜 정보가 들어있는 구조일 수 있음
         * 예)
         * attributes = { "resultcode": "...", "message": "...", "response": {email,name,birthyear,id...} }
         */

        // ✅ response 안에 진짜 사용자 정보가 들어 있으면 그 안쪽 map을 다시 attributes로 바꿔서 사용
        Object resp = attributes.get("response");
        if (resp instanceof Map<?, ?>) {
            attributes = (Map<String, Object>) resp;
        }

        // ✅ 네이버에서 내려오는 사용자 정보 꺼내기
        String email = (String) attributes.get("email");
        String name = (String) attributes.get("name");
        String birthyear = (String) attributes.get("birthyear");

        // ✅ 네이버 유저 고유 ID (우리 DB에서 "이 사람 누구인지" 구분할 때 사용)
        String providerId = (String) attributes.get("id");

        // providerId는 네이버 사용자를 구분하는 핵심값이라 없으면 로그인 진행을 막는다.
        if (!StringUtils.hasText(providerId)) {
            throw new IllegalArgumentException("네이버 사용자 ID를 가져오지 못했습니다.");
        }

        // email도 우리 서비스에서 회원 식별에 중요하므로 없으면 로그인 진행을 막는다.
        if (!StringUtils.hasText(email)) {
            throw new IllegalArgumentException("네이버 이메일을 가져오지 못했습니다.");
        }

        // name은 화면 표시용이라 없으면 기본값을 사용한다.
        String safeName = StringUtils.hasText(name) ? name : "사용자";

        //✅ 우리 DB에 회원이 이미 있으면 가져오고,없으면 새로 만들어서 저장한 뒤 반환
        User user = userService.findOrCreateNaverUser(providerId, email, safeName, birthyear);

        //✅ refreshToken은 accessToken이 만료됐을 때 새 accessToken을 다시 발급받는 데 쓰는 긴 수명의 토큰
        // 흐름 : 원본 refresh 문자열 생성 -> DB에는 해시값 저장 -> 브라우저에는 원본을 쿠키로 저장
        String refreshRaw = refreshTokenService.issue(user);

        // ✅ JWT subject 만들기
        // ✅ subject는 JWT의 "주인"을 나타내는 값
        // 필터(JwtAuthenticationFilter)가 subject를 userId로 쓰고 있으니 여기서도 userId로 맞추는 게 정석
        String subject = String.valueOf(user.getId());

        // ✅ JWT 안에 같이 넣고 싶은 정보(클레임)
        Map<String, Object> claims = new HashMap<>();

        // 필수값은 검증이 끝났으므로 그대로 넣는다.
        claims.put("email", email);

        // name은 null 방지용 기본값 처리된 safeName을 넣는다.
        claims.put("name", safeName);

        // birthyear는 선택값이라 값이 있을 때만 넣는다, null을 claims에 넣지 않기 위한 방어 코드다.
        if (StringUtils.hasText(birthyear)) {
            claims.put("birthyear", birthyear);
        }

        // ✅ accessToken(JWT) 발급
        // accessToken은 실제 API 요청할 때 로그인한 사용자입니다를 증명하는 짧은 수명의 토큰
        String jwt = jwtTokenProvider.createAccessToken(subject, claims);

        // ✅ 쿠키 저장은 AuthCookieService가 전담
        authCookieService.setRefreshCookie(response, refreshRaw);
        authCookieService.setAccessCookie(response, jwt);

        // ✅ 쿠키 저장까지 끝났으면 프론트 성공 페이지로 이동
        response.sendRedirect(frontendUrl + "/login/success");
    }
}