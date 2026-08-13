package shop.esjh.memoryjar.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/*
 * UserOAuthAccount 역할
 *
 * Memory Jar 사용자(User)가 사용할 수 있는
 * 소셜 로그인 계정을 저장하는 엔티티야.
 *
 * 쉽게 말하면:
 *
 * User = 실제 사람
 * UserOAuthAccount = 그 사람이 가지고 있는 로그인 열쇠
 *
 * 예:
 *
 * User 1명
 *   ├─ NAVER 계정
 *   └─ GOOGLE 계정
 *
 * 이렇게 분리하면 한 사용자가 네이버와 Google 중
 * 어떤 로그인 방법을 사용해도 같은 Memory Jar 회원으로 들어올 수 있어.
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(
        name = "user_oauth_accounts",

        /*
         * UNIQUE 제약 조건 역할
         *
         * 1. provider + provider_id
         *    같은 Google/Naver 계정이 여러 사용자에게
         *    동시에 연결되는 것을 막는다.
         *
         * 2. user_id + provider
         *    한 Memory Jar 사용자가 같은 종류의 OAuth 계정을
         *    두 개씩 연결하는 것을 막는다.
         *
         * 예:
         * user 1 + NAVER  → 1개
         * user 1 + GOOGLE → 1개
         */
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_user_oauth_accounts_provider_provider_id",
                        columnNames = {"provider", "provider_id"}
                ),
                @UniqueConstraint(
                        name = "uk_user_oauth_accounts_user_provider",
                        columnNames = {"user_id", "provider"}
                )
        }
)
public class UserOAuthAccount extends BaseEntity {

    /*
     * OAuth 계정 연결 정보 하나의 고유 번호야.
     *
     * 예:
     * 1번 = 은서의 NAVER 계정
     * 2번 = 은서의 GOOGLE 계정
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "oauth_account_id")
    private Long id;

    /*
     * 이 OAuth 계정이 어떤 Memory Jar 사용자에게
     * 연결되어 있는지 저장한다.
     *
     * 여러 OAuth 계정이 한 User에게 연결될 수 있으므로
     * ManyToOne 관계를 사용한다.
     *
     * 예:
     *
     * NAVER  ─┐
     *          ├─ User 1
     * GOOGLE ─┘
     *
     * LAZY는 실제 User 정보가 필요할 때만
     * DB에서 가져오도록 해서 불필요한 조회를 줄여준다.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "user_id",
            nullable = false,
            foreignKey = @ForeignKey(
                    name = "fk_user_oauth_accounts_user"
            )
    )
    private User user;

    /*
     * 어떤 소셜 로그인 서비스인지 저장한다.
     *
     * 현재 값:
     * NAVER
     * GOOGLE
     *
     * 나중에 카카오 로그인을 추가한다면
     * KAKAO 같은 값도 들어갈 수 있다.
     */
    @Column(
            name = "provider",
            nullable = false,
            length = 20
    )
    private String provider;

    /*
     * 각 OAuth 서비스가 사용자에게 부여한 고유 ID야.
     *
     * NAVER:
     * 네이버 응답의 id
     *
     * GOOGLE:
     * Google OpenID Connect 응답의 sub
     *
     * 이메일이 아니라 이 값을 이용해
     * 이미 연결된 OAuth 계정인지 판단한다.
     */
    @Column(
            name = "provider_id",
            nullable = false,
            length = 100
    )
    private String providerId;

    /*
     * 새로운 OAuth 로그인 계정을 만들 때 사용하는 생성자야.
     *
     * Service에서:
     *
     * UserOAuthAccount.builder()
     *     .user(user)
     *     .provider("GOOGLE")
     *     .providerId("123456...")
     *     .build();
     *
     * 형태로 사용할 수 있다.
     */
    @Builder
    private UserOAuthAccount(
            User user,
            String provider,
            String providerId
    ) {
        this.user = user;
        this.provider = provider;
        this.providerId = providerId;
    }
}