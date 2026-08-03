package shop.esjh.memoryjar.service.onboarding;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.onboarding.response.OnboardingProgressItemResponse;
import shop.esjh.memoryjar.dto.onboarding.response.OnboardingProgressResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.onboarding.UserOnboardingProgress;
import shop.esjh.memoryjar.enums.onboarding.OnboardingStatus;
import shop.esjh.memoryjar.enums.onboarding.OnboardingTutorialKey;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.onboarding.UserOnboardingProgressRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OnboardingServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserOnboardingProgressRepository onboardingRepository;

    @InjectMocks
    private OnboardingService onboardingService;

    @Test
    @DisplayName("온보딩 조회 시 네 가지 온보딩 상태를 모두 반환한다")
    void getMyProgress_returnsAllTutorialKeys() {
        // given
        User user = createUser(1L);

        UserOnboardingProgress welcomeProgress =
                UserOnboardingProgress.create(
                        user,
                        OnboardingTutorialKey.WELCOME,
                        1,
                        OnboardingStatus.COMPLETED,
                        LocalDateTime.of(2026, 8, 3, 14, 0)
                );

        when(userRepository.existsById(1L))
                .thenReturn(true);

        when(onboardingRepository
                .findAllByUser_IdAndTutorialVersionAndDeletedAtIsNullOrderByTutorialKeyAsc(
                        1L,
                        1
                ))
                .thenReturn(List.of(welcomeProgress));

        // when
        OnboardingProgressResponse response =
                onboardingService.getMyProgress(1L);

        // then
        assertThat(response.version()).isEqualTo(1);
        assertThat(response.items()).hasSize(4);

        assertThat(response.items())
                .extracting(
                        OnboardingProgressItemResponse::tutorialKey
                )
                .containsExactly(
                        OnboardingTutorialKey.WELCOME,
                        OnboardingTutorialKey.JAR_LIST,
                        OnboardingTutorialKey.JAR_DETAIL,
                        OnboardingTutorialKey.DAILY_DRAW
                );

        OnboardingProgressItemResponse welcome =
                response.items().get(0);

        assertThat(welcome.handled()).isTrue();
        assertThat(welcome.status())
                .isEqualTo(OnboardingStatus.COMPLETED);

        OnboardingProgressItemResponse jarList =
                response.items().get(1);

        assertThat(jarList.handled()).isFalse();
        assertThat(jarList.status()).isNull();
        assertThat(jarList.finishedAt()).isNull();
    }

    @Test
    @DisplayName("기록이 없으면 새로운 완료 기록을 저장한다")
    void finish_createsNewProgress() {
        // given
        User user = createUser(1L);

        when(userRepository.findByIdForUpdate(1L))
                .thenReturn(Optional.of(user));

        when(onboardingRepository
                .findByUser_IdAndTutorialKeyAndTutorialVersionAndDeletedAtIsNull(
                        1L,
                        OnboardingTutorialKey.WELCOME,
                        1
                ))
                .thenReturn(Optional.empty());

        when(onboardingRepository.save(
                any(UserOnboardingProgress.class)
        )).thenAnswer(invocation -> invocation.getArgument(0));

        // when
        OnboardingProgressItemResponse response =
                onboardingService.finish(
                        1L,
                        OnboardingTutorialKey.WELCOME,
                        OnboardingStatus.COMPLETED
                );

        // then
        assertThat(response.handled()).isTrue();
        assertThat(response.tutorialKey())
                .isEqualTo(OnboardingTutorialKey.WELCOME);
        assertThat(response.status())
                .isEqualTo(OnboardingStatus.COMPLETED);
        assertThat(response.finishedAt()).isNotNull();

        ArgumentCaptor<UserOnboardingProgress> captor =
                ArgumentCaptor.forClass(
                        UserOnboardingProgress.class
                );

        verify(onboardingRepository).save(captor.capture());

        UserOnboardingProgress savedProgress =
                captor.getValue();

        assertThat(savedProgress.getUser())
                .isEqualTo(user);
        assertThat(savedProgress.getTutorialVersion())
                .isEqualTo(1);
    }

    @Test
    @DisplayName("건너뛴 온보딩을 나중에 완료 상태로 변경할 수 있다")
    void finish_changesSkippedToCompleted() {
        // given
        User user = createUser(1L);
        LocalDateTime oldFinishedAt =
                LocalDateTime.of(2026, 8, 3, 10, 0);

        UserOnboardingProgress progress =
                UserOnboardingProgress.create(
                        user,
                        OnboardingTutorialKey.JAR_DETAIL,
                        1,
                        OnboardingStatus.SKIPPED,
                        oldFinishedAt
                );

        when(userRepository.findByIdForUpdate(1L))
                .thenReturn(Optional.of(user));

        when(onboardingRepository
                .findByUser_IdAndTutorialKeyAndTutorialVersionAndDeletedAtIsNull(
                        1L,
                        OnboardingTutorialKey.JAR_DETAIL,
                        1
                ))
                .thenReturn(Optional.of(progress));

        // when
        OnboardingProgressItemResponse response =
                onboardingService.finish(
                        1L,
                        OnboardingTutorialKey.JAR_DETAIL,
                        OnboardingStatus.COMPLETED
                );

        // then
        assertThat(response.status())
                .isEqualTo(OnboardingStatus.COMPLETED);
        assertThat(response.finishedAt())
                .isAfter(oldFinishedAt);

        verify(onboardingRepository, never()).save(any());
    }

    @Test
    @DisplayName("완료한 온보딩은 건너뛰기 상태로 낮추지 않는다")
    void finish_doesNotDowngradeCompletedToSkipped() {
        // given
        User user = createUser(1L);
        LocalDateTime completedAt =
                LocalDateTime.of(2026, 8, 3, 11, 0);

        UserOnboardingProgress progress =
                UserOnboardingProgress.create(
                        user,
                        OnboardingTutorialKey.WELCOME,
                        1,
                        OnboardingStatus.COMPLETED,
                        completedAt
                );

        when(userRepository.findByIdForUpdate(1L))
                .thenReturn(Optional.of(user));

        when(onboardingRepository
                .findByUser_IdAndTutorialKeyAndTutorialVersionAndDeletedAtIsNull(
                        1L,
                        OnboardingTutorialKey.WELCOME,
                        1
                ))
                .thenReturn(Optional.of(progress));

        // when
        OnboardingProgressItemResponse response =
                onboardingService.finish(
                        1L,
                        OnboardingTutorialKey.WELCOME,
                        OnboardingStatus.SKIPPED
                );

        // then
        assertThat(response.status())
                .isEqualTo(OnboardingStatus.COMPLETED);
        assertThat(response.finishedAt())
                .isEqualTo(completedAt);

        verify(onboardingRepository, never()).save(any());
    }

    @Test
    @DisplayName("사용자를 찾을 수 없으면 404 예외가 발생한다")
    void finish_throwsNotFoundWhenUserDoesNotExist() {
        // given
        when(userRepository.findByIdForUpdate(999L))
                .thenReturn(Optional.empty());

        // when
        ResponseStatusException exception =
                catchThrowableOfType(
                        () -> onboardingService.finish(
                                999L,
                                OnboardingTutorialKey.WELCOME,
                                OnboardingStatus.COMPLETED
                        ),
                        ResponseStatusException.class
                );

        // then
        assertThat(exception).isNotNull();
        assertThat(exception.getStatusCode().value())
                .isEqualTo(404);
        assertThat(exception.getReason())
                .isEqualTo("사용자를 찾을 수 없어요.");

        verifyNoInteractions(onboardingRepository);
    }

    private User createUser(Long userId) {
        User user = User.builder()
                .provider("NAVER")
                .providerId("provider-" + userId)
                .email("user" + userId + "@example.com")
                .name("사용자" + userId)
                .birthyear("2000")
                .build();

        ReflectionTestUtils.setField(
                user,
                "id",
                userId
        );

        return user;
    }
}