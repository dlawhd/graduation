package com.example.demo.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

// refresh 토큰 원본을 안전하게 만들고, DB에 저장할 때는 원본 대신 해시(SHA-256)로 바꿔주는 클래스
public final class TokenCrypto {

    // ✅ SecureRandom: 예측하기 어려운 랜덤을 만들기 위한 도구
    private static final SecureRandom RND = new SecureRandom();

    private TokenCrypto() {}

    // 쿠키로 내려줄 refresh "원본" 생성
    public static String generateRefreshRaw() {

        // ✅ 32바이트짜리 랜덤 상자 만들기
        byte[] bytes = new byte[32];

        // ✅ 예측 불가능한 랜덤 값으로 채우기
        RND.nextBytes(bytes);

        // ✅ 쿠키에 넣기 좋게 문자열로 변환 (URL-safe, padding 제거)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    // ✅ DB에는 SHA-256 해시(64글자 hex)로 저장
    public static String sha256Hex(String raw) {
        try {

            // ✅ SHA-256 해시 기계 꺼내기
            MessageDigest md = MessageDigest.getInstance("SHA-256");

            // ✅ raw 문자열을 바이트로 바꾼 뒤 해시 계산
            byte[] digest = md.digest(raw.getBytes(StandardCharsets.UTF_8));

            // ✅ 해시 결과(바이트 배열)를 사람이 읽기 좋은 16진수 문자열로 변환
            return toHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 실패", e);
        }
    }

    // ✅ 바이트 배열 -> 16진수(hex) 문자열로 바꾸는 함수
    private static String toHex(byte[] bytes) {

        // ✅ 바이트 1개는 hex 2글자라서 length*2 만큼 공간 잡아두면 효율 좋음
        StringBuilder sb = new StringBuilder(bytes.length * 2);

        // ✅ 바이트 하나씩 2글자 hex로 붙이기 (예: 0a, ff, 10 ...)
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}