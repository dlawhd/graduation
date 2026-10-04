package shop.esjh.memoryjar.jwt;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.repository.UserRepository;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** 버전 없는 기존 토큰 호환과 재설정 후 버전 거부를 별도로 검증한다. */
class SessionValidityServiceTest {
    @Test
    void onlyCurrentVersionIsValid() {
        UserRepository users = mock(UserRepository.class);
        SessionValidityService service = new SessionValidityService(users);
        when(users.findSessionVersionById(1L)).thenReturn(Optional.of(0L), Optional.of(1L), Optional.of(1L), Optional.empty());
        assertThat(service.isCurrent(1L, 0L)).isTrue();
        assertThat(service.isCurrent(1L, 0L)).isFalse();
        assertThat(service.isCurrent(1L, 1L)).isTrue();
        assertThat(service.isCurrent(1L, 1L)).isFalse();
    }
}
