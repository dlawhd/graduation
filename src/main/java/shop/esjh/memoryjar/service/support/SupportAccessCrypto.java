package shop.esjh.memoryjar.service.support;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 게스트 토큰은 일방향으로 보관하고 IP 제한 키는 별도 용도 HMAC으로 익명화한다. 원문은 저장하지 않는다. */
@Component
public class SupportAccessCrypto {
    private final SecretKeySpec secret;
    private final SecureRandom random = new SecureRandom();
    public SupportAccessCrypto(@Value("${app.auth.email-verification-secret}") String secret) {
        if (secret == null || secret.length() < 32) throw new IllegalArgumentException("문의 접근 암호화 설정이 필요합니다.");
        this.secret = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }
    public String newToken() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    public String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException("문의 접근 암호화 실패"); }
    }
    public String privateKey(String value) {
        try { Mac mac = Mac.getInstance("HmacSHA256"); mac.init(secret);
            return HexFormat.of().formatHex(mac.doFinal(("SUPPORT_RATE_V1|" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) { throw new IllegalStateException("문의 제한 키 생성 실패"); }
    }
}
