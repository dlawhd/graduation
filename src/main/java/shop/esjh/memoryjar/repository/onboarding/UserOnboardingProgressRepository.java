package shop.esjh.memoryjar.repository.onboarding;

import org.springframework.data.jpa.repository.JpaRepository;
import shop.esjh.memoryjar.entity.onboarding.UserOnboardingProgress;
import shop.esjh.memoryjar.enums.onboarding.OnboardingTutorialKey;

import java.util.List;
import java.util.Optional;

/*
 * UserOnboardingProgressRepository 역할
 *
 * 사용자 온보딩 진행 기록을 DB에서 조회하고 저장한다.
 */
public interface UserOnboardingProgressRepository
        extends JpaRepository<UserOnboardingProgress, Long> {

    /*
     * 현재 사용자의 특정 버전 온보딩 기록을 모두 조회한다.
     */
    List<UserOnboardingProgress> findAllByUser_IdAndTutorialVersionAndDeletedAtIsNullOrderByTutorialKeyAsc(
            Long userId,
            int tutorialVersion
    );

    /*
     * 현재 사용자의 특정 온보딩 기록 1개를 조회한다.
     */
    Optional<UserOnboardingProgress> findByUser_IdAndTutorialKeyAndTutorialVersionAndDeletedAtIsNull(
            Long userId,
            OnboardingTutorialKey tutorialKey,
            int tutorialVersion
    );
}