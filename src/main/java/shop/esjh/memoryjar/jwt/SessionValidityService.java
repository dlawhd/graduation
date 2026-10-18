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
}
