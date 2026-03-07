package com.example.demo.controller;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CsrfController {

    // ✅ 프론트가 이걸 호출하면 서버가 CSRF 토큰을 만들어 줘
    // 그리고 CookieCsrfTokenRepository 설정에 따라 XSRF-TOKEN 쿠키도 같이 내려가.
    @GetMapping("/api/csrf")
    public CsrfToken csrf(CsrfToken csrfToken) {
        return csrfToken; // { headerName, parameterName, token } 형태로 내려옴
    }
}