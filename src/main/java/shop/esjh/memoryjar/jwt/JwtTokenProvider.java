package shop.esjh.memoryjar.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;
import java.util.Optional;

/** 토큰을 발급하고 서명·만료를 검증한다. 파서만 공유하고 검증 결과는 요청마다 새로 얻는다. */
@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final JwtParser parser;
    private final long accessExpMillis;

    public JwtTokenProvider(
            @Value("${app.jwt.secret}")
            String secret,

            @Value("${app.jwt.access-exp-seconds}")
            long accessExpSeconds
    ) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        // build() 결과는 불변이며 여러 요청 스레드에서 안전하게 재사용할 수 있다.
        this.parser = Jwts.parser().verifyWith(key).build();
        this.accessExpMillis = accessExpSeconds * 1000L;
    }

    public String createAccessToken(String subject, Map<String, Object> claims) {
        Date now = new Date();
        Date exp = new Date(now.getTime() + accessExpMillis);

        return Jwts.builder()
                .subject(subject)
                .claims(claims)
                .issuedAt(now)
                .expiration(exp)
                .signWith(key)
                .compact();
    }

    // ✅ 토큰이 유효한지 확인 (서명/만료 포함)
    public boolean validate(String token) {
        return parseValidatedClaims(token).isPresent();
    }

    /** 서명·만료 검증과 정보 추출을 한 번에 수행한다. 원문 토큰이나 예외 내용은 기록하지 않는다. */
    public Optional<Claims> parseValidatedClaims(String token) {
        try {
            return Optional.of(getClaims(token));
        } catch (JwtException | IllegalArgumentException invalidToken) {
            return Optional.empty();
        }
    }

    // ✅ 토큰에서 subject(email 같은 거) 꺼내기
    public String getSubject(String token) {
        return getClaims(token).getSubject();
    }

    private Claims getClaims(String token) {
        return parser.parseSignedClaims(token)
                .getPayload();
    }

    // ✅ 토큰 안에 들어있는 데이터(클레임) 통째로 꺼내기
    public Claims getClaimsFromToken(String token) {
        return getClaims(token);
    }

}
