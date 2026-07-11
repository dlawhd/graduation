package shop.esjh.memoryjar.service;

import shop.esjh.memoryjar.auth.TokenCrypto;
import shop.esjh.memoryjar.config.properties.JwtProperties;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.RefreshToken;
import shop.esjh.memoryjar.repository.RefreshTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;

// refresh 토큰을 발급하고, 검증하고, 예전 refresh는 폐기하고 새 refresh로 바꿔주기(회전), 폐기하는 핵심 서비스
@Service
public class RefreshTokenService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final String INVALID_REFRESH_TOKEN_MESSAGE = "refresh 토큰이 유효하지 않음";

    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtProperties jwtProperties;

    /*
     * 현재 한국 시간을 반환해.
     *
     * 토큰의 만료 검사와 폐기 시간을 같은 시간대로 맞추기 위해
     * 한 곳에서 시간을 생성해.
     */
    private LocalDateTime nowKst() {
        return LocalDateTime.now(KST);
    }

    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository,
                               JwtProperties jwtProperties) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.jwtProperties = jwtProperties;
    }

    // ✅ 로그인 성공 시 refresh 토큰 발급 + DB 저장
    @Transactional
    public String issue(User user) {

        // 현재 시간을 한국 시간으로 만든다.
        LocalDateTime now = nowKst();

        // ✅ 브라우저에 저장할 refresh 토큰 원본 생성
        String raw = TokenCrypto.generateRefreshRaw();

        // ✅ DB에는 원본 대신 해시값 저장
        String hash = TokenCrypto.sha256Hex(raw);

        // ✅ RefreshToken 엔티티 만들기
        RefreshToken entity = RefreshToken.builder()
                .user(user)
                .tokenHash(hash)
                .expiresAt(now.plusSeconds(jwtProperties.getRefreshExpSeconds())) // 만료 시간(지금으로부터 14일 뒤)
                .build();

        refreshTokenRepository.save(entity);
        return raw; // ✅ 쿠키에 넣어줄 원본 refresh 토큰 반환
    }

    /*
     * 기존 refresh 토큰을 새 refresh 토큰으로 교체해.
     *
     * 처리 순서:
     * 1. 토큰 원본을 해시값으로 변환
     * 2. 해당 DB 행에 쓰기 잠금 적용
     * 3. 잠금을 얻은 뒤 최신 토큰 상태 검사
     * 4. 기존 토큰 폐기
     * 5. 새 토큰 생성 및 저장
     *
     * 같은 토큰으로 요청이 동시에 들어와도
     * 먼저 잠금을 얻은 한 요청만 성공할 수 있어.
     */
    @Transactional
    public Rotation rotate(String refreshRaw) {
        validateRefreshRaw(refreshRaw);

        LocalDateTime now = nowKst();
        String hash = TokenCrypto.sha256Hex(refreshRaw);

        /*
         * 여기에서 DB 행 잠금을 얻어.
         *
         * 요청 A가 먼저 잠금을 얻으면 요청 B는 기다려야 해.
         */
        RefreshToken oldToken = refreshTokenRepository
                .findByTokenHashForUpdate(hash)
                .orElseThrow(this::invalidRefreshTokenException);

        /*
         * 잠금을 얻은 다음 최신 상태를 검사해야 해.
         *
         * 요청 B는 기다리는 동안 요청 A가 토큰을 폐기했을 수 있으므로
         * 반드시 잠금 이후에 검사해야 해.
         */
        if (!oldToken.isActive(now)) {
            throw invalidRefreshTokenException();
        }

        // 기존 refresh 토큰을 폐기해.
        oldToken.revoke(now);

        // 새 토큰도 동일한 사용자의 토큰으로 만들어야 해.
        User user = oldToken.getUser();

        // 새로운 refresh 토큰 원본을 생성해.
        String newRaw = TokenCrypto.generateRefreshRaw();

        // DB 저장을 위해 새로운 토큰도 해시값으로 바꿔.
        String newHash = TokenCrypto.sha256Hex(newRaw);

        RefreshToken nextToken = RefreshToken.builder()
                .user(user)
                .tokenHash(newHash)
                .expiresAt(
                        now.plusSeconds(
                                jwtProperties.getRefreshExpSeconds()
                        )
                )
                .build();

        refreshTokenRepository.save(nextToken);

        return new Rotation(user, newRaw);
    }

    /*
     * 로그아웃할 때 refresh 토큰이 존재하면 폐기해.
     *
     * rotate()와 logout()이 동시에 실행될 수도 있으므로
     * 로그아웃 처리에도 동일한 DB 잠금을 사용해.
     */
    @Transactional
    public void revokeIfPresent(String refreshRaw) {
        if (refreshRaw == null || refreshRaw.isBlank()) {
            return;
        }

        LocalDateTime now = nowKst();
        String hash = TokenCrypto.sha256Hex(refreshRaw);

        refreshTokenRepository
                .findByTokenHashForUpdate(hash)
                .filter(refreshToken -> refreshToken.isActive(now))
                .ifPresent(refreshToken -> refreshToken.revoke(now));
    }


    /*
     * refresh 토큰 원본이 비어 있는지 검사해.
     *
     * Controller에서도 검사하지만,
     * 서비스가 다른 곳에서 직접 호출될 가능성까지 방어해.
     */
    private void validateRefreshRaw(String refreshRaw) {
        if (refreshRaw == null || refreshRaw.isBlank()) {
            throw invalidRefreshTokenException();
        }
    }

    /*
     * 유효하지 않은 refresh 토큰 예외를 한 곳에서 만들어.
     *
     * 같은 예외 메시지를 여러 곳에서 반복하지 않도록 정리한 거야.
     */
    private IllegalArgumentException invalidRefreshTokenException() {
        return new IllegalArgumentException(
                INVALID_REFRESH_TOKEN_MESSAGE
        );
    }

    /*
     * rotate()가 사용자와 새 refresh 토큰 원본을
     * 함께 반환하기 위한 작은 결과 객체야.
     */
    public record Rotation(
            User user,
            String newRefreshRaw
    ) {
    }
}