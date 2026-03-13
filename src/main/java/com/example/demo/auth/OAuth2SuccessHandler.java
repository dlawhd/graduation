package com.example.demo.auth;

import com.example.demo.entity.Member;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.AuthCookieService;
import com.example.demo.service.MemberService;
import com.example.demo.service.RefreshTokenService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    // ✅ AccessToken(JWT) 만드는 도구
    private final JwtTokenProvider jwtTokenProvider;

    // ✅ 네이버로 받은 사용자 정보를 "우리 DB 회원"으로 저장/조회하는 서비스
    private final MemberService memberService;

    // ✅ RefreshToken(재발급용 토큰)을 발급하고 DB에 저장하는 서비스
    private final RefreshTokenService refreshTokenService;

    private final AuthCookieService authCookieService;

    // ✅ 로그인 성공 후 프론트로 보내줄 주소(예: https://www.esjh.shop)
    @Value("${app.frontend-url}")
    private String frontendUrl;

    // ✅ 필요한 도구들을 스프링이 자동으로 넣어줌(주입)
    public OAuth2SuccessHandler(JwtTokenProvider jwtTokenProvider,
                                MemberService memberService,
                                RefreshTokenService refreshTokenService,
                                AuthCookieService authCookieService) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.memberService = memberService;
        this.refreshTokenService = refreshTokenService;
        this.authCookieService = authCookieService;
    }

    /**
     * ✅ OAuth2(네이버) 로그인에 성공했을 때 자동으로 호출되는 메서드
     * 흐름:
     * 1) 네이버에서 받은 사용자 정보 꺼내기
     * 2) 우리 DB에 회원 저장/조회
     * 3) RefreshToken 발급 + 쿠키 저장
     * 4) AccessToken(JWT) 발급 + 쿠키 저장
     * 5) 프론트 페이지로 리다이렉트
     */
    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException, ServletException {

        // ✅ OAuth2 로그인 결과(네이버 계정 정보 포함)
        OAuth2AuthenticationToken token = (OAuth2AuthenticationToken) authentication;

        // ✅ 네이버에서 내려준 사용자 정보(속성들) 가져오기
        Map<String, Object> attributes = token.getPrincipal().getAttributes();

        /**
         * ✅ 네이버는 user-name-attribute를 response로 잡아서
         * attributes 안에 response라는 키가 있고, 그 안에 진짜 정보가 들어있는 구조일 수 있음
         * 예)
         * attributes = { "resultcode": "...", "message": "...", "response": {email,name,birthyear,id...} }
         */
        Object resp = attributes.get("response");
        if (resp instanceof Map<?, ?>) {
            // ✅ response 안에 있는 Map이 진짜 사용자 정보임
            attributes = (Map<String, Object>) resp;
        }

        // ✅ 네이버에서 내려오는 사용자 정보 꺼내기
        String email = (String) attributes.get("email");
        String name = (String) attributes.get("name");
        String birthyear = (String) attributes.get("birthyear");

        // ✅ 네이버 유저 고유 ID (우리 DB에서 "이 사람 누구인지" 구분할 때 사용)
        String providerId = (String) attributes.get("id");
        if (providerId == null) providerId = "unknown"; // 방어 코드(거의 안 나옴)

        /**
         * ✅ 우리 DB에 회원이 이미 있으면 가져오고,
         * 없으면 새로 만들어서 저장한 뒤 반환
         *
         * 결과: member 객체에는 우리 DB의 memberId가 들어있음
         */
        Member member = memberService.findOrCreateNaverMember(providerId, email, name, birthyear);

        // ✅ Refresh 토큰 발급 + 쿠키 저장
        /**
         * ✅ refreshToken은 "accessToken을 다시 만드는 열쇠" 같은 것
         * - 만료 길게(14일)
         * - DB에 저장해서 '로그아웃하면 폐기(revoked_at)' 가능
         * - 쿠키로 브라우저에 심어둠
         */
        String refreshRaw = refreshTokenService.issue(member);

        // ✅ Access 토큰(JWT) 발급 + 쿠키 저장
        /**
         * ✅ subject는 JWT의 "주인"을 나타내는 값
         * 너 필터(JwtAuthenticationFilter)가 subject를 memberId로 쓰고 있으니까
         * 여기서도 memberId로 맞추는 게 정석
         */
        String subject = String.valueOf(member.getId());

        // ✅ JWT 안에 같이 넣고 싶은 정보(클레임)
        Map<String, Object> claims = new HashMap<>();
        claims.put("email", email);
        claims.put("name", name);
        claims.put("birthyear", birthyear);

        /**
         * ✅ accessToken은 "출입증" 같은 것
         * - 만료 짧게(30분)
         * - 요청마다 이 토큰으로 로그인 인증 처리
         */
        String jwt = jwtTokenProvider.createAccessToken(subject, claims);

        // ✅ 쿠키 저장은 AuthCookieService가 전담
        authCookieService.setRefreshCookie(response, refreshRaw);
        authCookieService.setAccessCookie(response, jwt);

        // ✅ 로그인 성공 페이지로 이동
        /**
         * ✅ 쿠키 저장까지 끝났으면 프론트 성공 페이지로 이동
         * 예: https://www.esjh.shop/login/success
         */
        response.sendRedirect(frontendUrl + "/login/success");
    }
}