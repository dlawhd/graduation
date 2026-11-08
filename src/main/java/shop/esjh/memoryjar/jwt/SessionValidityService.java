package shop.esjh.memoryjar.jwt;

import org.springframework.stereotype.Service;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.monitoring.LoginDiagnostics;

/** 토큰 발급 당시의 세션 버전과 DB의 현재 버전을 비교해 폐기된 로그인을 차단한다. */
@Service
public class SessionValidityService {
    private final UserRepository userRepository;

    public SessionValidityService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public boolean isCurrent(long userId, long sessionVersion) {
        // Repository 호출 전체이므로 연결 획득 대기·조회 실행을 포함한다. 순수 SQL 시간으로 해석하지 않는다.
        return LoginDiagnostics.measure(LoginDiagnostics.Stage.SESSION_VERSION_QUERY,
                () -> userRepository.findSessionVersionById(userId))
                .filter(version -> version == sessionVersion).isPresent();
    }

    /** 정상 배달은 로그인과 멤버 확인을 한 번에 읽는다. 탈퇴·로그아웃은 다음 배달부터 즉시 차단한다. */
    public boolean isCurrentJarSession(long userId, long version, String sessionId, long jarId) {
        if (userId <= 0 || jarId <= 0 || sessionId != null && (sessionId.isBlank() || sessionId.length() > 64)) return false;
        return userRepository.countCurrentJarSession(userId, version, sessionId, jarId,
                java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Seoul"))) == 1L;
    }

    /** 새 토큰은 로그아웃된 기기의 accessToken도 즉시 차단한다. 이전 토큰은 만료까지 호환한다. */
    public boolean isCurrent(long userId, long sessionVersion, String sessionId) {
        if (sessionId == null) return isCurrent(userId, sessionVersion);
        if (sessionId.isBlank() || sessionId.length() > 64) return false;
        return LoginDiagnostics.measure(LoginDiagnostics.Stage.SESSION_VERSION_QUERY,
                () -> userRepository.countCurrentSession(userId, sessionVersion, sessionId,
                        java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Seoul")))) == 1L;
    }
}
