package com.example.demo.controller;

import com.example.demo.entity.Member;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.AuthCookieService;
import com.example.demo.service.RefreshTokenService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import jakarta.servlet.http.Cookie;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// 컨트롤러 테스트는 요청이 잘 들어오는지, 응답 상태코드가 맞는지, JSON 결과가 맞는지, 서비스를 잘 호출하는지를 빠르게 확인하는 게 목적
@WebMvcTest(AuthController.class) // AuthController 중심으로 웹 테스트 환경을 만듦
@AutoConfigureMockMvc(addFilters = false) // 테스트할 때 보안 필터(Security Filter)는 잠깐 끄는 옵션
class AuthControllerTest {


    @Autowired
    private MockMvc mockMvc; // 가짜 브라우저 역할을 하는 도구. 실제로 서버를 띄우지 않아도 HTTP 요청을 보낸 것처럼 테스트할 수 있다

    // 가짜 객체(mock)
    @MockitoBean
    private RefreshTokenService refreshTokenService;

    @MockitoBean
    private AuthCookieService authCookieService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void refresh쿠키가_없으면_401() throws Exception {

        // .with(csrf())는 POST 요청이라 CSRF 토큰을 함께 붙여준다
        mockMvc.perform(post("/api/auth/refresh").with(csrf()))

                // 응답 상태코드가 401인지 확인
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refresh성공시_ok_true와_쿠키_재발급() throws Exception {
        Member member = Member.builder()
                .id(1L)
                .email("test@test.com")
                .name("은서")
                .birthyear("2000")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        given(refreshTokenService.rotate("old-refresh"))
                .willReturn(new RefreshTokenService.Rotation(member, "new-refresh"));

        given(jwtTokenProvider.createAccessToken(eq("1"), anyMap()))
                .willReturn("new-access");

        mockMvc.perform(post("/api/auth/refresh")
                        .with(csrf())
                        .cookie(new Cookie("refreshToken", "old-refresh")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        // 컨트롤러가 새 access 쿠키를 심었는지 확인
        verify(authCookieService).setAccessCookie(any(), eq("new-access"));

        // 컨트롤러가 새 refresh 쿠키를 심었는지 확인
        verify(authCookieService).setRefreshCookie(any(), eq("new-refresh"));
    }

    @Test
    void logout은_쿠키_삭제를_호출한다() throws Exception {
        mockMvc.perform(post("/api/auth/logout")
                        .with(csrf())
                        .cookie(new Cookie("refreshToken", "refresh-value")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        // refresh token 폐기 메서드가 호출되었는지 확인
        verify(refreshTokenService).revokeIfPresent("refresh-value");

        // access 쿠키 삭제 메서드가 호출되었는지 확인
        verify(authCookieService).clearAccessCookie(any());

        // refresh 쿠키 삭제 메서드가 호출되었는지 확인
        verify(authCookieService).clearRefreshCookie(any());
    }
}