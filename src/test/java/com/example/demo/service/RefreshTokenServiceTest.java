package com.example.demo.service;

import com.example.demo.auth.TokenCrypto;
import com.example.demo.config.JwtProperties;
import com.example.demo.entity.Member;
import com.example.demo.entity.RefreshToken;
import com.example.demo.repository.RefreshTokenRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

// Mockito를 이용해서 "가짜 Repository"를 넣고 RefreshTokenService의 로직만 빠르게 검사하는 단위 테스트
@ExtendWith(MockitoExtension.class) // Mockito 기능을 JUnit5 테스트에서 쓸 수 있게 연결해주는 설정
class RefreshTokenServiceTest {

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    private RefreshTokenService refreshTokenService;

    // 각 테스트가 시작되기 전에 공통으로 실행되는 준비 코드
    // 스프링이 자동으로 만들어주는 게 아니라, 단위 테스트니까 우리가 직접 만들어서 넣음
    @BeforeEach
    void setUp() {
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setRefreshExpSeconds(1209600); // 14일
        refreshTokenService = new RefreshTokenService(refreshTokenRepository, jwtProperties);
    }

    @Test
    void issue는_raw를_반환하고_DB에는_hash를_저장한다() {
        Member member = Member.builder()
                .id(1L)
                .provider("NAVER")
                .providerId("naver-123")
                .email("test@test.com")
                .name("은서")
                .birthyear("2000")
                .build();

        // ArgumentCaptor : repository.save(...)에 실제로 어떤 RefreshToken 객체가 들어갔는지 잡아서 꺼내보기 위한 도구
        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);

        String raw = refreshTokenService.issue(member);

        verify(refreshTokenRepository).save(captor.capture());
        RefreshToken saved = captor.getValue();

        assertThat(raw).isNotBlank();
        assertThat(saved.getMember()).isEqualTo(member);
        assertThat(saved.getTokenHash()).isEqualTo(TokenCrypto.sha256Hex(raw));
        assertThat(saved.getRevokedAt()).isNull();
        assertThat(saved.getExpiresAt()).isAfter(LocalDateTime.now().minusSeconds(1));
    }

    @Test
    void rotate는_기존_토큰을_폐기하고_새토큰을_발급한다() {
        Member member = Member.builder()
                .id(1L)
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        String oldRaw = "old-refresh-token";
        String oldHash = TokenCrypto.sha256Hex(oldRaw);

        RefreshToken oldToken = RefreshToken.builder()
                .member(member)
                .tokenHash(oldHash)
                .expiresAt(LocalDateTime.now().plusDays(1))
                .build();

        when(refreshTokenRepository.findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(eq(oldHash), any(LocalDateTime.class)))
                .thenReturn(Optional.of(oldToken));

        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);

        RefreshTokenService.Rotation result = refreshTokenService.rotate(oldRaw);

        verify(refreshTokenRepository).save(captor.capture());
        RefreshToken newToken = captor.getValue();

        assertThat(oldToken.getRevokedAt()).isNotNull();
        assertThat(result.member()).isEqualTo(member);
        assertThat(result.newRefreshRaw()).isNotBlank();
        assertThat(newToken.getTokenHash()).isEqualTo(TokenCrypto.sha256Hex(result.newRefreshRaw()));
    }

    @Test
    void rotate는_유효하지_않은_토큰이면_예외가_난다() {
        when(refreshTokenRepository.findByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(anyString(), any(LocalDateTime.class)))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> refreshTokenService.rotate("wrong-token"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("유효하지 않음");
    }

    @Test
    void revokeIfPresent는_빈문자열이면_아무것도_하지_않는다() {
        refreshTokenService.revokeIfPresent(" ");

        verifyNoInteractions(refreshTokenRepository);
    }
}