package com.example.demo.auth;

import com.example.demo.entity.Member;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.MemberService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
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

@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final JwtTokenProvider jwtTokenProvider;
    private final MemberService memberService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public OAuth2SuccessHandler(JwtTokenProvider jwtTokenProvider, MemberService memberService) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.memberService = memberService;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException, ServletException {

        OAuth2AuthenticationToken token = (OAuth2AuthenticationToken) authentication;

        // 네이버는 user-name-attribute가 response라서, attributes 안 구조가 살짝 다를 수 있어
        // 하지만 Spring이 "response"를 기준으로 매핑해주면 보통 아래처럼 꺼낼 수 있어.
        Map<String, Object> attributes = token.getPrincipal().getAttributes();

        Object resp = attributes.get("response");
        if (resp instanceof Map<?, ?>) {
            attributes = (Map<String, Object>) resp;
        }

        // ✅ 네이버에서 내려오는 값들
        String email = (String) attributes.get("email");
        String name = (String) attributes.get("name");
        String birthyear = (String) attributes.get("birthyear");

        // subject는 email을 추천(나중엔 DB userId로 바꾸면 더 좋음)
        String providerId = (String) attributes.get("id"); // 네이버 user id

        // providerId가 없으면 DB 저장 기준이 흔들리니 방어
        if (providerId == null) providerId = "unknown";

        // ✅ DB에 회원 저장(없으면 생성)
        Member member = memberService.findOrCreateNaverMember(providerId, email, name, birthyear);

        // ✅ subject는 memberId로 (정석)
        String subject = String.valueOf(member.getId());

        Map<String, Object> claims = new HashMap<>();
        claims.put("email", email);
        claims.put("name", name);
        claims.put("birthyear", birthyear);

        String jwt = jwtTokenProvider.createAccessToken(subject, claims);

        // ✅ HttpOnly 쿠키 세팅 (로컬용: Secure=false)
        Cookie cookie = new Cookie("accessToken", jwt);
        cookie.setHttpOnly(true);
        cookie.setSecure(false); // 운영(https)에서는 true로 바꿔야 함
        cookie.setPath("/");
        // 로컬에서는 domain 설정 안 하는 게 안전함

        response.addCookie(cookie);

        // ✅ 프론트로 이동 (로컬 프론트)
        response.sendRedirect(frontendUrl + "/login/success");
    }
}