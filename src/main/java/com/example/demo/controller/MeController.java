package com.example.demo.controller;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class MeController {

    @GetMapping("/api/me")
    public Map<String, Object> me(Authentication authentication) {
        if (authentication == null) {
            return Map.of("authenticated", false);
        }

        Object principal = authentication.getPrincipal();

        if (principal instanceof Map<?, ?> p) {
            return Map.of(
                    "authenticated", true,
                    "memberId", p.get("memberId"),
                    "email", p.get("email"),
                    "name", p.get("name"),
                    "birthyear", p.get("birthyear")
            );
        }

        return Map.of(
                "authenticated", true,
                "memberId", authentication.getName() // fallback
        );
    }
}