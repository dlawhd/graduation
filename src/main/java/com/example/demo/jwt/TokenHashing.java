package com.example.demo.jwt;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public final class TokenHashing {
    private TokenHashing() {}

    public static String sha256Hex(String rawToken) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest); // 길이 64
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}