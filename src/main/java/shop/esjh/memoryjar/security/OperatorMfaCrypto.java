package shop.esjh.memoryjar.security;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** 표준 TOTP 번호를 검사하고 인증 앱 비밀키를 AES-GCM으로 암호화한다. 외부 QR 서비스로 키를 보내지 않는다. */
@Component
public class OperatorMfaCrypto {
    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private final SecureRandom random = new SecureRandom();
    private final SecretKeySpec encryptionKey;
    private final byte[] bootstrapDigest;

    public OperatorMfaCrypto(@Value("${app.support.mfa.encryption-key:}") String key,
                             @Value("${app.support.mfa.bootstrap-secret:}") String bootstrap) {
        if (key == null || key.isBlank()) encryptionKey = null;
        else {
            byte[] decoded;
            try { decoded = Base64.getDecoder().decode(key); }
            catch (IllegalArgumentException e) { throw new IllegalArgumentException("운영자 MFA 키는 32바이트 Base64여야 합니다."); }
            if (decoded.length != 32) throw new IllegalArgumentException("운영자 MFA 키는 32바이트 Base64여야 합니다.");
            encryptionKey = new SecretKeySpec(decoded, "AES");
        }
        if (bootstrap != null && !bootstrap.isBlank() && (bootstrap.length() < 32 || bootstrap.length() > 256))
            throw new IllegalArgumentException("운영자 최초 등록 코드에는 32~256자의 난수가 필요합니다.");
        bootstrapDigest = bootstrap == null || bootstrap.isBlank() ? null : digest(bootstrap);
    }

    public boolean configured() { return encryptionKey != null; }
    public boolean bootstrapConfigured() { return bootstrapDigest != null; }
    public void requireConfigured() {
        if (!configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "운영자 추가 인증의 서버 설정이 필요합니다.");
    }
    public boolean matchesBootstrap(String candidate) {
        return bootstrapDigest != null && candidate != null && MessageDigest.isEqual(bootstrapDigest, digest(candidate));
    }

    public String newSecret() {
        byte[] bytes = new byte[20]; random.nextBytes(bytes);
        StringBuilder result = new StringBuilder(32);
        int buffer = 0, bits = 0;
        for (byte value : bytes) {
            buffer = (buffer << 8) | (value & 255); bits += 8;
            while (bits >= 5) { bits -= 5; result.append(ALPHABET.charAt((buffer >>> bits) & 31)); }
        }
        return result.toString();
    }

    /** 암호문을 다른 사용자 행으로 옮겨도 복호화할 수 없게 사용자 번호를 인증 데이터로 묶는다. */
    public String encrypt(Long userId, String secret) {
        requireConfigured();
        try {
            byte[] nonce = new byte[12]; random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad(userId));
            byte[] encrypted = cipher.doFinal(secret.getBytes(StandardCharsets.US_ASCII));
            return "v1:" + Base64.getEncoder().encodeToString(ByteBuffer.allocate(12 + encrypted.length).put(nonce).put(encrypted).array());
        } catch (GeneralSecurityException e) { throw unavailable(); }
    }

    public String decrypt(Long userId, String encoded) {
        requireConfigured();
        try {
            if (encoded == null || !encoded.startsWith("v1:")) throw new IllegalArgumentException();
            byte[] payload = Base64.getDecoder().decode(encoded.substring(3));
            if (payload.length < 29) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey, new GCMParameterSpec(128, payload, 0, 12));
            cipher.updateAAD(aad(userId));
            return new String(cipher.doFinal(payload, 12, payload.length - 12), StandardCharsets.US_ASCII);
        } catch (GeneralSecurityException | IllegalArgumentException e) { throw unavailable(); }
    }

    /** 30초 번호를 앞뒤 한 구간까지 허용한다. 같은 번호의 재사용은 호출한 서비스의 DB 잠금으로 막는다. */
    public long matchingStep(String secret, String code, Instant now, long lastUsed) {
        if (code == null || !code.matches("[0-9]{6}")) return -1;
        long current = now.getEpochSecond() / 30;
        for (long step = current - 1; step <= current + 1; step++) {
            if (step > lastUsed && MessageDigest.isEqual(code.getBytes(StandardCharsets.US_ASCII),
                    totp(secret, step).getBytes(StandardCharsets.US_ASCII))) return step;
        }
        return -1;
    }

    // RFC 6238의 기본 HMAC-SHA1, 30초, 6자리 규격으로 인증 앱과 호환한다.
    String totp(String secret, long step) {
        try {
            byte[] bytes = new byte[secret.length() * 5 / 8]; int buffer = 0, bits = 0, index = 0;
            for (char ch : secret.toCharArray()) {
                int value = ALPHABET.indexOf(ch); if (value < 0) throw new IllegalArgumentException("잘못된 TOTP 키 형식");
                buffer = (buffer << 5) | value; bits += 5;
                if (bits >= 8) { bits -= 8; bytes[index++] = (byte) (buffer >>> bits); }
            }
            Mac mac = Mac.getInstance("HmacSHA1"); mac.init(new SecretKeySpec(bytes, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
            int offset = hash[hash.length - 1] & 15;
            int number = ByteBuffer.wrap(hash, offset, 4).getInt() & 0x7fffffff;
            return String.format(Locale.ROOT, "%06d", number % 1_000_000);
        } catch (GeneralSecurityException e) { throw unavailable(); }
    }

    public List<String> newRecoveryCodes() {
        var codes = new ArrayList<String>(10);
        for (int i = 0; i < 10; i++) {
            byte[] bytes = new byte[16]; random.nextBytes(bytes);
            codes.add(HexFormat.of().formatHex(bytes));
        }
        return List.copyOf(codes);
    }
    private byte[] aad(Long id) { return ("MemoryJar|operator-mfa|v1|" + id).getBytes(StandardCharsets.UTF_8); }
    private static byte[] digest(String text) {
        try { return MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256을 사용할 수 없습니다."); }
    }
    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "운영자 인증 키를 확인하지 못했습니다. 서버 설정을 확인해 주세요.");
    }
}
