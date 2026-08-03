package shop.esjh.memoryjar.service.onboarding;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
import java.time.ZoneId;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.NOT_FOUND;

/*
 * OnboardingService 역할
 *
 * 현재 사용자의 온보딩 상태를 조회하고,
 * 완료 또는 건너뛰기 상태를 안전하게 저장한다.
 */
@Service
public class OnboardingService {

    // 현재 Memory Jar 온보딩 버전
    public static final int CURRENT_VERSION = 1;

    // 서비스의 시간 기준을 한국 시간으로 통일한다.
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final UserRepository userRepository;
    private final UserOnboardingProgressRepository onboardingRepository;

    public OnboardingService(
            UserRepository userRepository,
            UserOnboardingProgressRepository onboardingRepository
    ) {
        this.userRepository = userRepository;
        this.onboardingRepository = onboardingRepository;
    }

    /*
     * 현재 사용자의 전체 온보딩 상태를 조회한다.
     *
     * DB에 기록이 없는 온보딩도 handled=false로 응답한다.
     * 프론트는 이 값만 보고 자동 표시 여부를 결정할 수 있다.
     */
    @Transactional(readOnly = true)
    public OnboardingProgressResponse getMyProgress(Long userId) {
        validateUserExists(userId);

        List<UserOnboardingProgress> savedProgressList =
                onboardingRepository
                        .findAllByUser_IdAndTutorialVersionAndDeletedAtIsNullOrderByTutorialKeyAsc(
                                userId,
                                CURRENT_VERSION
                        );

        /*
         * EnumMap은 Enum을 열쇠로 사용할 때 적합한 가벼운 Map이다.
         *
         * 예:
         * WELCOME -> 완료 기록
         * JAR_LIST -> 건너뛰기 기록
         */
        Map<OnboardingTutorialKey, UserOnboardingProgress> progressByKey =
                new EnumMap<>(OnboardingTutorialKey.class);

        for (UserOnboardingProgress progress : savedProgressList) {
            progressByKey.put(
                    progress.getTutorialKey(),
                    progress
            );
        }

        /*
         * DB에 기록된 항목만 반환하지 않고
         * 현재 지원하는 네 가지 종류를 모두 반환한다.
         *
         * 기록이 없으면 handled=false로 내려준다.
         */
        List<OnboardingProgressItemResponse> items =
                Arrays.stream(OnboardingTutorialKey.values())
                        .map(tutorialKey -> {
                            UserOnboardingProgress progress =
                                    progressByKey.get(tutorialKey);

                            if (progress == null) {
                                return new OnboardingProgressItemResponse(
                                        tutorialKey,
                                        false,
                                        null,
                                        null
                                );
                            }

                            return toItemResponse(progress);
                        })
                        .toList();

        return new OnboardingProgressResponse(
                CURRENT_VERSION,
                items
        );
    }

    /*
     * 온보딩 완료 또는 건너뛰기 상태를 저장한다.
     */
    @Transactional
    public OnboardingProgressItemResponse finish(
            Long userId,
            OnboardingTutorialKey tutorialKey,
            OnboardingStatus status
    ) {
        /*
         * 사용자 행을 잠근 뒤 조회한다.
         *
         * 동일 사용자의 온보딩 저장 요청이 동시에 들어와도
         * 한 요청씩 순서대로 처리되게 한다.
         */
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        NOT_FOUND,
                        "사용자를 찾을 수 없어요."
                ));

        LocalDateTime now = LocalDateTime.now(KST);

        UserOnboardingProgress progress =
                onboardingRepository
                        .findByUser_IdAndTutorialKeyAndTutorialVersionAndDeletedAtIsNull(
                                userId,
                                tutorialKey,
                                CURRENT_VERSION
                        )
                        .map(existingProgress -> {
                            existingProgress.finish(status, now);
                            return existingProgress;
                        })
                        .orElseGet(() -> onboardingRepository.save(
                                UserOnboardingProgress.create(
                                        user,
                                        tutorialKey,
                                        CURRENT_VERSION,
                                        status,
                                        now
                                )
                        ));

        return toItemResponse(progress);
    }

    // 사용자 번호가 실제 DB에 존재하는지 확인한다.
    private void validateUserExists(Long userId) {
        if (!userRepository.existsById(userId)) {
            throw new ResponseStatusException(
                    NOT_FOUND,
                    "사용자를 찾을 수 없어요."
            );
        }
    }

    // Entity를 프론트 응답 DTO로 바꾼다.
    private OnboardingProgressItemResponse toItemResponse(
            UserOnboardingProgress progress
    ) {
        return new OnboardingProgressItemResponse(
                progress.getTutorialKey(),
                true,
                progress.getStatus(),
                progress.getFinishedAt()
        );
    }
}