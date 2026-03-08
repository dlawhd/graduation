package com.example.demo.controller;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

//  우리는 쿠키 기반 인증(accessToken, refreshToken)을 쓰고 있음. 쿠키 기반 인증은 CSRF 공격을 막기 위해 "CSRF 토큰"도 같이 검사하는 방식이 안전함.
@RestController
public class CsrfController {
    // 프론트가 /api/csrf 를 호출하면 Spring Security가 생성한 CSRF 토큰 정보를 응답으로 내려줌.
    // 응답에는 headerName (예: X-XSRF-TOKEN), parameterName (예: _csrf), token 이런 것들을 포함.
    @GetMapping("/api/csrf")
        public CsrfToken csrf(CsrfToken csrfToken) {
            return csrfToken; // { headerName, parameterName, token } 형태로 내려옴
    }
}