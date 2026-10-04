package shop.esjh.memoryjar.jwt;

import org.springframework.stereotype.Service;
import shop.esjh.memoryjar.repository.UserRepository;

/** 토큰 발급 당시의 세션 버전과 DB의 현재 버전을 비교해 폐기된 로그인을 차단한다. */
@Service
public class SessionValidityService {
    private final UserRepository userRepository;

    public SessionValidityService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public boolean isCurrent(long userId, long sessionVersion) {
        return userRepository.findSessionVersionById(userId)
                .filter(version -> version == sessionVersion).isPresent();
    }
}
