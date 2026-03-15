package com.example.demo.jwt;

import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// access token을 잘 만드는지, 만든 토큰이 유효한지, subject를 잘 꺼내는지
// claims를 잘 꺼내는지, 깨졌거나 만료된 토큰은 유효하지 않은지
class JwtTokenProviderTest {

    // ✅ 테스트용 시크릿 키
    private static final String SECRET = "01234567890123456789012345678901";

    @Test
    void createAccessToken_생성한_토큰은_validate가_true를_반환한다() {
        // given
        JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(SECRET, 1800);
        String subject = "user@example.com";
        Map<String, Object> claims = Map.of(
                "memberId", 1L,
                "role", "USER"
        );

        // when
        String token = jwtTokenProvider.createAccessToken(subject, claims);

        // then
        assertThat(token).isNotBlank();
        assertThat(jwtTokenProvider.validate(token)).isTrue();
    }

    @Test
    void getSubject_토큰에서_subject를_정상적으로_꺼낸다() {
        // given
        JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(SECRET, 1800);
        String subject = "user@example.com";

        String token = jwtTokenProvider.createAccessToken(
                subject,
                Map.of("role", "USER")
        );

        // when
        String result = jwtTokenProvider.getSubject(token);

        // then
        assertThat(result).isEqualTo(subject);
    }

    @Test
    void getClaimsFromToken_토큰에서_claim를_정상적으로_꺼낸다() {
        // given
        JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(SECRET, 1800);

        String token = jwtTokenProvider.createAccessToken(
                "user@example.com",
                Map.of(
                        "memberId", 10L,
                        "role", "USER",
                        "nickname", "eunseo"
                )
        );

        // when
        Claims claims = jwtTokenProvider.getClaimsFromToken(token);

        // then
        assertThat(claims.getSubject()).isEqualTo("user@example.com");
        assertThat(claims.get("memberId", Integer.class)).isEqualTo(10);
        assertThat(claims.get("role", String.class)).isEqualTo("USER");
        assertThat(claims.get("nickname", String.class)).isEqualTo("eunseo");
    }

    @Test
    void validate_토큰이_변조되면_false를_반환한다() {
        // given
        JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(SECRET, 1800);

        String token = jwtTokenProvider.createAccessToken(
                "user@example.com",
                Map.of("role", "USER")
        );

        // ✅ 뒤에 글자를 붙여서 일부러 망가뜨린 토큰 만들기
        String tamperedToken = token + "broken";

        // when
        boolean result = jwtTokenProvider.validate(tamperedToken);

        // then
        assertThat(result).isFalse();
    }

    @Test
    void validate_만료된_토큰이면_false를_반환한다() {
        // given
        // ✅ 만료 시간을 과거로 만들어서 이미 만료된 토큰을 생성
        JwtTokenProvider expiredJwtTokenProvider = new JwtTokenProvider(SECRET, -1);

        String expiredToken = expiredJwtTokenProvider.createAccessToken(
                "user@example.com",
                Map.of("role", "USER")
        );

        // when
        boolean result = expiredJwtTokenProvider.validate(expiredToken);

        // then
        assertThat(result).isFalse();
    }

    @Test
    void getSubject_유효하지_않은_토큰이면_예외가_발생한다() {
        // given
        JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(SECRET, 1800);
        String invalidToken = "this.is.not.a.valid.token";

        // when & then
        assertThatThrownBy(() -> jwtTokenProvider.getSubject(invalidToken))
                .isInstanceOf(Exception.class);
    }
}