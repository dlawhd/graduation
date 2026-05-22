package shop.esjh.memoryjar.service;

import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

// 기존 회원이 있으면 정보를 최신값으로 갱신해서 저장하는지, 기존 회원이 없으면 새 회원을 만들어 저장하는지
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @Test
    void findOrCreateNaverUser_기존_회원이_있으면_프로필을_갱신하고_저장한다() {
        // given
        String providerId = "naver-123";
        String email = "new@email.com";
        String name = "새이름";
        String birthyear = "2000";

        // ✅ 이미 DB에 들어있다고 가정하는 기존 회원
        User existingUser = User.builder()
                .provider("NAVER")
                .providerId(providerId)
                .email("old@email.com")
                .name("옛날이름")
                .birthyear("1999")
                .build();

        // ✅ provider + providerId로 조회했을 때 기존 회원이 나온다고 가짜 설정
        when(userRepository.findByProviderAndProviderId("NAVER", providerId))
                .thenReturn(Optional.of(existingUser));

        // ✅ save가 호출되면, 저장한 객체를 그대로 돌려준다고 가정
        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // when
        User result = userService.findOrCreateNaverUser(providerId, email, name, birthyear);

        // then
        // ✅ save할 때 실제 어떤 user 들어갔는지 잡아오기
        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());

        User savedUser = userCaptor.getValue();

        // ✅ 기존 회원의 프로필이 최신값으로 바뀌었는지 확인
        assertThat(savedUser.getProvider()).isEqualTo("NAVER");
        assertThat(savedUser.getProviderId()).isEqualTo(providerId);
        assertThat(savedUser.getEmail()).isEqualTo(email);
        assertThat(savedUser.getName()).isEqualTo(name);
        assertThat(savedUser.getBirthyear()).isEqualTo(birthyear);

        // ✅ 반환값도 저장된 회원인지 확인
        assertThat(result.getEmail()).isEqualTo(email);
        assertThat(result.getName()).isEqualTo(name);
        assertThat(result.getBirthyear()).isEqualTo(birthyear);

        // ✅ 조회와 저장이 각각 1번씩 호출됐는지 확인
        verify(userRepository, times(1)).findByProviderAndProviderId("NAVER", providerId);
        verify(userRepository, times(1)).save(any(User.class));
    }

    @Test
    void findOrCreateNaverUser_기존_회원이_없으면_새회원을_만들어_저장한다() {
        // given
        String providerId = "naver-999";
        String email = "newuser@email.com";
        String name = "신규회원";
        String birthyear = "2001";

        // ✅ 조회 결과가 비어 있음 = 기존 회원 없음
        when(userRepository.findByProviderAndProviderId("NAVER", providerId))
                .thenReturn(Optional.empty());

        // ✅ save가 호출되면 저장한 객체를 그대로 반환
        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // when
        User result = userService.findOrCreateNaverUser(providerId, email, name, birthyear);

        // then
        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());

        User savedUser = userCaptor.getValue();

        // ✅ 새 회원이 올바른 값으로 만들어졌는지 확인
        assertThat(savedUser.getProvider()).isEqualTo("NAVER");
        assertThat(savedUser.getProviderId()).isEqualTo(providerId);
        assertThat(savedUser.getEmail()).isEqualTo(email);
        assertThat(savedUser.getName()).isEqualTo(name);
        assertThat(savedUser.getBirthyear()).isEqualTo(birthyear);

        // ✅ 반환값도 확인
        assertThat(result.getProvider()).isEqualTo("NAVER");
        assertThat(result.getProviderId()).isEqualTo(providerId);
        assertThat(result.getEmail()).isEqualTo(email);
        assertThat(result.getName()).isEqualTo(name);
        assertThat(result.getBirthyear()).isEqualTo(birthyear);

        verify(userRepository, times(1)).findByProviderAndProviderId("NAVER", providerId);
        verify(userRepository, times(1)).save(any(User.class));
    }
}