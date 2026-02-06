package com.example.demo.controller;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class AuthController {

    @PostMapping("/api/logout")
    public Map<String, Object> logout(HttpServletResponse response) {

        Cookie cookie = new Cookie("accessToken", "");
        cookie.setHttpOnly(true);
        cookie.setSecure(false); // 운영에서 true
        cookie.setPath("/");
        cookie.setMaxAge(0); // ✅ 즉시 삭제

        response.addCookie(cookie);

        return Map.of("ok", true);
    }
}