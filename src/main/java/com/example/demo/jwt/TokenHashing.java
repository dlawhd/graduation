package com.example.demo.jwt;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

// ✅ refresh 토큰 원본(rawToken)을 SHA-256 해시 문자열로 바꿔주는 도구
public final class TokenHashing {

    // 유틸 클래스란 기능만 모아둔 클래스
    // 객체를 만드는 건 보통 “상태를 저장해야 할 때
    private TokenHashing() {}

    // ✅ refresh 토큰 원본(rawToken)을 SHA-256 해시 문자열로 바꿔주는 메서드
    public static String sha256Hex(String rawToken) {
        try {

            // ✅ SHA-256 해시 계산 도구 가져오기
            // MessageDigest는 문자열을 해시값으로 바꿔주는 자바 기본 도구
            MessageDigest md = MessageDigest.getInstance("SHA-256");

            // ✅ rawToken 문자열을 UTF-8 바이트로 바꾼 뒤 해시 계산
            //  해시 함수는 문자열을 바로 받는 게 아니라 바이트 배열을 받아서 계산
            byte[] digest = md.digest(rawToken.getBytes(StandardCharsets.UTF_8));

            // ✅ 계산된 바이트 배열을 16진수(hex) 문자열로 변환
            // SHA-256 결과는 byte[] 형태라서 그대로는 DB에 보기 좋게 저장하기 불편
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}