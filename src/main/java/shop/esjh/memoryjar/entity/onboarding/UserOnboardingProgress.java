package shop.esjh.memoryjar.entity.onboarding;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;
import shop.esjh.memoryjar.entity.BaseEntity;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.enums.onboarding.OnboardingStatus;
import shop.esjh.memoryjar.enums.onboarding.OnboardingTutorialKey;

import java.time.LocalDateTime;
import java.util.Objects;

/*
 * UserOnboardingProgress 역할
 *
 * 사용자 한 명이 어떤 온보딩을 완료하거나 건너뛰었는지
 * DB에 저장하는 온보딩 진행 기록의 본체다.
 *
 * 예:
 * 사용자 1번이 WELCOME 버전 1을 완료했다.
 * 사용자 2번이 JAR_DETAIL 버전 1을 건너뛰었다.
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(
        name = "user_onboarding_progress",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uq_user_onboarding_progress_user_key_version",
                        columnNames = {
                                "user_id",
                                "tutorial_key",
                                "tutorial_version"
                        }
                )
        },
        indexes = {
                @Index(
                        name = "idx_user_onboarding_progress_user_version_deleted",
                        columnList = "user_id, tutorial_version, deleted_at"
                )
        }
)
@SQLDelete(
        sql = """
              UPDATE user_onboarding_progress
                 SET deleted_at = NOW(6),
                     updated_at = NOW(6)
               WHERE onboarding_progress_id = ?
              """
)
@SQLRestriction("deleted_at IS NULL")
public class UserOnboardingProgress extends BaseEntity {

    // 온보딩 기록 하나마다 붙는 고유 번호표
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "onboarding_progress_id")
    private Long onboardingProgressId;

    // 이 온보딩 기록의 사용자
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "user_id",
            nullable = false,
            foreignKey = @ForeignKey(
                    name = "fk_user_onboarding_progress_user"
            )
    )
    private User user;

    // WELCOME, JAR_LIST, JAR_DETAIL, DAILY_DRAW 중 하나
    @Enumerated(EnumType.STRING)
    @Column(name = "tutorial_key", nullable = false, length = 30)
    private OnboardingTutorialKey tutorialKey;

    // 현재 온보딩 내용의 버전
    @Column(name = "tutorial_version", nullable = false)
    private int tutorialVersion;

    // 완료 또는 건너뛰기 상태
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OnboardingStatus status;

    // 사용자가 완료 또는 건너뛰기를 선택한 시간
    @Column(name = "finished_at", nullable = false)
    private LocalDateTime finishedAt;

    @Builder
    private UserOnboardingProgress(
            User user,
            OnboardingTutorialKey tutorialKey,
            int tutorialVersion,
            OnboardingStatus status,
            LocalDateTime finishedAt
    ) {
        this.user = Objects.requireNonNull(
                user,
                "온보딩 사용자는 필수예요."
        );
        this.tutorialKey = Objects.requireNonNull(
                tutorialKey,
                "온보딩 종류는 필수예요."
        );

        if (tutorialVersion < 1) {
            throw new IllegalArgumentException(
                    "온보딩 버전은 1 이상이어야 해요."
            );
        }

        this.tutorialVersion = tutorialVersion;
        this.status = Objects.requireNonNull(
                status,
                "온보딩 상태는 필수예요."
        );
        this.finishedAt = Objects.requireNonNull(
                finishedAt,
                "온보딩 종료 시간은 필수예요."
        );
    }

    /*
     * 새로운 온보딩 진행 기록을 만드는 메서드
     */
    public static UserOnboardingProgress create(
            User user,
            OnboardingTutorialKey tutorialKey,
            int tutorialVersion,
            OnboardingStatus status,
            LocalDateTime finishedAt
    ) {
        return UserOnboardingProgress.builder()
                .user(user)
                .tutorialKey(tutorialKey)
                .tutorialVersion(tutorialVersion)
                .status(status)
                .finishedAt(finishedAt)
                .build();
    }

    /*
     * 기존 온보딩 상태를 변경하는 메서드
     *
     * 중요 규칙:
     * 1. COMPLETED는 최종 상태이므로 SKIPPED로 되돌리지 않는다.
     * 2. SKIPPED 상태에서 다시 안내를 보고 끝까지 완료하면
     *    COMPLETED로 바꿀 수 있다.
     * 3. 같은 요청이 반복되면 시간을 다시 변경하지 않는다.
     */
    public void finish(
            OnboardingStatus newStatus,
            LocalDateTime newFinishedAt
    ) {
        Objects.requireNonNull(
                newStatus,
                "온보딩 상태는 필수예요."
        );
        Objects.requireNonNull(
                newFinishedAt,
                "온보딩 종료 시간은 필수예요."
        );

        // 이미 완료했다면 건너뛰기 상태로 낮추지 않는다.
        if (this.status == OnboardingStatus.COMPLETED) {
            return;
        }

        // 같은 요청이 반복되면 기존 기록을 그대로 유지한다.
        if (this.status == newStatus) {
            return;
        }

        this.status = newStatus;
        this.finishedAt = newFinishedAt;
    }
}