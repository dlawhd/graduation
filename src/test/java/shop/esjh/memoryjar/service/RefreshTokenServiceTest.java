package shop.esjh.memoryjar.service;

import shop.esjh.memoryjar.auth.TokenCrypto;
import shop.esjh.memoryjar.config.properties.JwtProperties;
import shop.esjh.memoryjar.entity.RefreshToken;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.repository.RefreshTokenRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/*
 * RefreshTokenServiceTest 역할
 *
 * 실제 DB를 사용하지 않고 가짜 Repository를 사용해서
 * RefreshTokenService의 발급, 회전, 폐기 규칙을 검사해.
 */
@ExtendWith(MockitoExtension.class)
class RefreshTokenServiceTest {

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    private RefreshTokenService refreshTokenService;

    @BeforeEach
    void setUp() {
        JwtProperties jwtProperties = new JwtProperties();

        // refresh 토큰 유효 기간을 14일로 설정해.
        jwtProperties.setRefreshExpSeconds(1_209_600);

        refreshTokenService = new RefreshTokenService(
                refreshTokenRepository,
                jwtProperties
        );
    }

    @Test
    void issue는_raw를_반환하고_DB에는_hash를_저장한다() {
        // given
        User user = createUser();

        ArgumentCaptor<RefreshToken> captor =
                ArgumentCaptor.forClass(RefreshToken.class);

        // when
        String raw = refreshTokenService.issue(user);

        // then
        verify(refreshTokenRepository).save(captor.capture());

        RefreshToken savedToken = captor.getValue();

        assertThat(raw).isNotBlank();
        assertThat(savedToken.getUser()).isEqualTo(user);
        assertThat(savedToken.getTokenHash())
                .isEqualTo(TokenCrypto.sha256Hex(raw));
        assertThat(savedToken.getRevokedAt()).isNull();
    }

    @Test
    void rotate는_잠금으로_조회한_기존토큰을_폐기하고_새토큰을_발급한다() {
        // given
        User user = createUser();

        String oldRaw = "old-refresh-token";
        String oldHash = TokenCrypto.sha256Hex(oldRaw);

        RefreshToken oldToken = RefreshToken.builder()
                .user(user)
                .tokenHash(oldHash)
                .expiresAt(LocalDateTime.now().plusDays(1))
                .build();

        when(refreshTokenRepository.findByTokenHashForUpdate(oldHash))
                .thenReturn(Optional.of(oldToken));

        ArgumentCaptor<RefreshToken> captor =
                ArgumentCaptor.forClass(RefreshToken.class);

        // when
        RefreshTokenService.Rotation result =
                refreshTokenService.rotate(oldRaw);

        // then
        verify(refreshTokenRepository)
                .findByTokenHashForUpdate(oldHash);

        verify(refreshTokenRepository)
                .save(captor.capture());

        RefreshToken newToken = captor.getValue();

        assertThat(oldToken.getRevokedAt()).isNotNull();
        assertThat(result.user()).isEqualTo(user);
        assertThat(result.newRefreshRaw()).isNotBlank();
        assertThat(newToken.getTokenHash())
                .isEqualTo(
                        TokenCrypto.sha256Hex(
                                result.newRefreshRaw()
                        )
                );
    }

    @Test
    void rotate는_DB에_토큰이_없으면_예외가_난다() {
        // given
        when(refreshTokenRepository.findByTokenHashForUpdate(anyString()))
                .thenReturn(Optional.empty());

        // when & then
        assertThatThrownBy(
                () -> refreshTokenService.rotate("wrong-token")
        )
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("유효하지 않음");
    }

    @Test
    void rotate는_이미_폐기된_토큰이면_예외가_난다() {
        // given
        String raw = "revoked-refresh-token";
        String hash = TokenCrypto.sha256Hex(raw);

        RefreshToken revokedToken = RefreshToken.builder()
                .user(createUser())
                .tokenHash(hash)
                .expiresAt(LocalDateTime.now().plusDays(1))
                .revokedAt(LocalDateTime.now())
                .build();

        when(refreshTokenRepository.findByTokenHashForUpdate(hash))
                .thenReturn(Optional.of(revokedToken));

        // when & then
        assertThatThrownBy(() -> refreshTokenService.rotate(raw))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("유효하지 않음");

        // 유효하지 않으므로 새 토큰을 저장하면 안 돼.
        verify(refreshTokenRepository, never())
                .save(any(RefreshToken.class));
    }

    @Test
    void rotate는_만료된_토큰이면_예외가_난다() {
        // given
        String raw = "expired-refresh-token";
        String hash = TokenCrypto.sha256Hex(raw);

        RefreshToken expiredToken = RefreshToken.builder()
                .user(createUser())
                .tokenHash(hash)
                .expiresAt(LocalDateTime.now().minusMinutes(1))
                .build();

        when(refreshTokenRepository.findByTokenHashForUpdate(hash))
                .thenReturn(Optional.of(expiredToken));

        // when & then
        assertThatThrownBy(() -> refreshTokenService.rotate(raw))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("유효하지 않음");

        verify(refreshTokenRepository, never())
                .save(any(RefreshToken.class));
    }

    @Test
    void revokeIfPresent는_빈문자열이면_Repository를_호출하지_않는다() {
        // when
        refreshTokenService.revokeIfPresent(" ");

        // then
        verifyNoInteractions(refreshTokenRepository);
    }

    @Test
    void revokeIfPresent는_유효한_토큰을_잠금조회하고_폐기한다() {
        // given
        String raw = "logout-refresh-token";
        String hash = TokenCrypto.sha256Hex(raw);

        RefreshToken token = RefreshToken.builder()
                .user(createUser())
                .tokenHash(hash)
                .expiresAt(LocalDateTime.now().plusDays(1))
                .build();

        when(refreshTokenRepository.findByTokenHashForUpdate(hash))
                .thenReturn(Optional.of(token));

        // when
        refreshTokenService.revokeIfPresent(raw);

        // then
        assertThat(token.getRevokedAt()).isNotNull();

        verify(refreshTokenRepository)
                .findByTokenHashForUpdate(hash);
    }

    /*
     * 여러 테스트에서 사용하는 사용자 객체를 만들어.
     */
    private User createUser() {
        return User.builder()
                .id(1L)
                .provider("NAVER")
                .providerId("naver-123")
                .email("test@test.com")
                .name("은서")
                .birthyear("2000")
                .build();
    }
}