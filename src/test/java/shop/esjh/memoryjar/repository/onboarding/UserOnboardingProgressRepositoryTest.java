package shop.esjh.memoryjar.repository.onboarding;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.onboarding.UserOnboardingProgress;
import shop.esjh.memoryjar.enums.onboarding.OnboardingStatus;
import shop.esjh.memoryjar.enums.onboarding.OnboardingTutorialKey;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/*
 * UserOnboardingProgressRepositoryTest 역할
 *
 * 실제 MariaDB와 Flyway V24 테이블을 사용해서
 * 사용자별 온보딩 조회가 정확하게 동작하는지 확인한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(
        replace = AutoConfigureTestDatabase.Replace.NONE
)
@Import(JpaAuditConfig.class)
class UserOnboardingProgressRepositoryTest
        extends AbstractMariaDbRepositoryTest {

    @Autowired
    private UserOnboardingProgressRepository onboardingRepository;

    @Test
    @DisplayName("현재 사용자와 현재 버전의 온보딩 기록만 조회한다")
    void findAllByUserAndVersion_returnsMatchingProgress() {
        // given
        User user = saveUser(
                "onboarding-user",
                "onboarding-user@example.com",
                "온보딩 사용자"
        );

        User otherUser = saveUser(
                "onboarding-other",
                "onboarding-other@example.com",
                "다른 사용자"
        );

        saveProgress(
                user,
                OnboardingTutorialKey.WELCOME,
                1,
                OnboardingStatus.COMPLETED
        );

        saveProgress(
                user,
                OnboardingTutorialKey.JAR_LIST,
                1,
                OnboardingStatus.SKIPPED
        );

        // 같은 사용자지만 다른 버전
        saveProgress(
                user,
                OnboardingTutorialKey.WELCOME,
                2,
                OnboardingStatus.COMPLETED
        );

        // 다른 사용자의 기록
        saveProgress(
                otherUser,
                OnboardingTutorialKey.JAR_DETAIL,
                1,
                OnboardingStatus.COMPLETED
        );

        flushAndClear();

        // when
        List<UserOnboardingProgress> result =
                onboardingRepository
                        .findAllByUser_IdAndTutorialVersionAndDeletedAtIsNullOrderByTutorialKeyAsc(
                                user.getId(),
                                1
                        );

        // then
        assertThat(result).hasSize(2);

        /*
         * Repository 메서드가 tutorial_key 기준 오름차순으로 조회한다.
         *
         * DB에는 Enum이 문자열로 저장되므로 알파벳 순서에 따라
         * JAR_LIST가 WELCOME보다 먼저 조회된다.
         */
        assertThat(result)
                .extracting(
                        UserOnboardingProgress::getTutorialKey
                )
                .containsExactly(
                        OnboardingTutorialKey.JAR_LIST,
                        OnboardingTutorialKey.WELCOME
                );
    }

    @Test
    @DisplayName("사용자와 종류와 버전이 모두 맞는 기록을 조회한다")
    void findOne_returnsMatchingProgress() {
        // given
        User user = saveUser(
                "onboarding-find-user",
                "onboarding-find-user@example.com",
                "조회 사용자"
        );

        saveProgress(
                user,
                OnboardingTutorialKey.DAILY_DRAW,
                1,
                OnboardingStatus.COMPLETED
        );

        flushAndClear();

        // when & then
        assertThat(
                onboardingRepository
                        .findByUser_IdAndTutorialKeyAndTutorialVersionAndDeletedAtIsNull(
                                user.getId(),
                                OnboardingTutorialKey.DAILY_DRAW,
                                1
                        )
        )
                .isPresent()
                .get()
                .extracting(
                        UserOnboardingProgress::getStatus
                )
                .isEqualTo(OnboardingStatus.COMPLETED);
    }

    @Test
    @DisplayName("새 저금통 만들기 온보딩 기록을 저장하고 조회한다")
    void saveAndFind_jarCreateProgress() {
        // given
        User user = saveUser(
                "jar-create-onboarding-user",
                "jar-create-onboarding@example.com",
                "저금통 생성 안내 사용자"
        );

        saveProgress(
                user,
                OnboardingTutorialKey.JAR_CREATE,
                1,
                OnboardingStatus.COMPLETED
        );

        flushAndClear();

        // when
        UserOnboardingProgress progress =
                onboardingRepository
                        .findByUser_IdAndTutorialKeyAndTutorialVersionAndDeletedAtIsNull(
                                user.getId(),
                                OnboardingTutorialKey.JAR_CREATE,
                                1
                        )
                        .orElseThrow();

        // then
        assertThat(progress.getTutorialKey())
                .isEqualTo(
                        OnboardingTutorialKey.JAR_CREATE
                );

        assertThat(progress.getStatus())
                .isEqualTo(
                        OnboardingStatus.COMPLETED
                );
    }

    private UserOnboardingProgress saveProgress(
            User user,
            OnboardingTutorialKey tutorialKey,
            int version,
            OnboardingStatus status
    ) {
        return persist(
                UserOnboardingProgress.create(
                        user,
                        tutorialKey,
                        version,
                        status,
                        LocalDateTime.now()
                )
        );
    }
}