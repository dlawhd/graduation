package com.example.demo.auth;

import com.example.demo.entity.Member;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.AuthCookieService;
import com.example.demo.service.MemberService;
import com.example.demo.service.RefreshTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.util.ReflectionTestUtils;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OAuth2SuccessHandlerTest {

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @Mock
    private MemberService memberService;

    @Mock
    private RefreshTokenService refreshTokenService;

    @Mock
    private AuthCookieService authCookieService;

    private OAuth2SuccessHandler oAuth2SuccessHandler;

    @BeforeEach
    void setUp() {
        oAuth2SuccessHandler = new OAuth2SuccessHandler(
                jwtTokenProvider,
                memberService,
                refreshTokenService,
                authCookieService
        );

        // ✅ @Value로 들어가는 frontendUrl은 테스트에서 직접 넣어야 함
        ReflectionTestUtils.setField(
                oAuth2SuccessHandler,
                "frontendUrl",
                "https://www.esjh.shop"
        );
    }

    @Test
    void onAuthenticationSuccess_네이버_응답에서_회원조회후_토큰쿠키_저장하고_리다이렉트한다() throws Exception {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        OAuth2User principal = mock(OAuth2User.class);

        Map<String, Object> innerResponse = new HashMap<>();
        innerResponse.put("id", "naver-123");
        innerResponse.put("email", "user@example.com");
        innerResponse.put("name", "은서");
        innerResponse.put("birthyear", "2000");

        Map<String, Object> outerAttributes = new HashMap<>();
        outerAttributes.put("response", innerResponse);

        when(authentication.getPrincipal()).thenReturn(principal);
        when(principal.getAttributes()).thenReturn(outerAttributes);

        Member member = mock(Member.class);
        when(member.getId()).thenReturn(1L);

        when(memberService.findOrCreateNaverMember(
                "naver-123",
                "user@example.com",
                "은서",
                "2000"
        )).thenReturn(member);

        when(refreshTokenService.issue(member)).thenReturn("refresh-raw-token");
        when(jwtTokenProvider.createAccessToken(eq("1"), anyMap())).thenReturn("access-jwt-token");

        // when
        oAuth2SuccessHandler.onAuthenticationSuccess(request, response, authentication);

        // then
        // ✅ 회원 조회/생성 서비스가 올바른 값으로 호출됐는지 확인
        verify(memberService).findOrCreateNaverMember(
                "naver-123",
                "user@example.com",
                "은서",
                "2000"
        );

        // ✅ refresh 토큰 발급 호출 확인
        verify(refreshTokenService).issue(member);

        // ✅ access 토큰 발급 시 subject가 memberId 문자열인지 확인
        // 그리고 claims 안에 email, name, birthyear가 들어갔는지도 확인
        verify(jwtTokenProvider).createAccessToken(
                eq("1"),
                argThat(claims ->
                        "user@example.com".equals(claims.get("email")) &&
                                "은서".equals(claims.get("name")) &&
                                "2000".equals(claims.get("birthyear"))
                )
        );

        // ✅ 쿠키 저장 요청 확인
        verify(authCookieService).setRefreshCookie(response, "refresh-raw-token");
        verify(authCookieService).setAccessCookie(response, "access-jwt-token");

        // ✅ 마지막에 프론트 성공 페이지로 이동했는지 확인
        assertThat(response.getRedirectedUrl())
                .isEqualTo("https://www.esjh.shop/login/success");
    }

    @Test
    void onAuthenticationSuccess_providerId가_없으면_unknown으로_회원조회한다() throws Exception {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        OAuth2AuthenticationToken authentication = mock(OAuth2AuthenticationToken.class);
        OAuth2User principal = mock(OAuth2User.class);

        // ✅ id가 없는 네이버 응답
        Map<String, Object> innerResponse = new HashMap<>();
        innerResponse.put("email", "user@example.com");
        innerResponse.put("name", "은서");
        innerResponse.put("birthyear", "2000");

        Map<String, Object> outerAttributes = new HashMap<>();
        outerAttributes.put("response", innerResponse);

        when(authentication.getPrincipal()).thenReturn(principal);
        when(principal.getAttributes()).thenReturn(outerAttributes);

        Member member = mock(Member.class);
        when(member.getId()).thenReturn(99L);

        when(memberService.findOrCreateNaverMember(
                "unknown",
                "user@example.com",
                "은서",
                "2000"
        )).thenReturn(member);

        when(refreshTokenService.issue(member)).thenReturn("refresh-token");
        when(jwtTokenProvider.createAccessToken(eq("99"), anyMap())).thenReturn("access-token");

        // when
        oAuth2SuccessHandler.onAuthenticationSuccess(request, response, authentication);

        // then
        // ✅ providerId가 null이면 unknown으로 바꿔서 회원 조회하는지 확인
        verify(memberService).findOrCreateNaverMember(
                "unknown",
                "user@example.com",
                "은서",
                "2000"
        );

        verify(refreshTokenService).issue(member);
        verify(authCookieService).setRefreshCookie(response, "refresh-token");
        verify(authCookieService).setAccessCookie(response, "access-token");

        assertThat(response.getRedirectedUrl())
                .isEqualTo("https://www.esjh.shop/login/success");
    }
}