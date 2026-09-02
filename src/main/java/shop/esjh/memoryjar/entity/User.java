package shop.esjh.memoryjar.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@Entity
@SQLDelete(sql = "UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
@Table(
        name = "users",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_users_email", columnNames = "email"),
                @UniqueConstraint(name = "uk_users_provider_provider_id", columnNames = {"provider", "provider_id"})
        }
)
public class User extends BaseEntity{

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = true, length = 255)
    private String email;

    @Column(nullable = true, length = 50)
    private String name;

    @Column(nullable = true, length = 10)
    private String birthyear;

    /*
     * 기존 OAuth 로그인 호환용 Provider 정보야.
     *
     * 예:
     * NAVER
     * GOOGLE
     * KAKAO
     *
     * 기존 소셜 로그인 사용자는 값이 들어가지만,
     * Memory Jar 자체 아이디/비밀번호로 가입한 LOCAL 사용자는
     * OAuth Provider가 없기 때문에 NULL이 들어갈 수 있어.
     *
     * 실제 OAuth 로그인 계정 관리는
     * UserOAuthAccount가 담당하고 있어.
     */
    @Column(nullable = true, length = 20)
    private String provider;

    /*
     * 기존 OAuth Provider가 사용자에게 부여한 고유 ID야.
     *
     * 예:
     * NAVER 사용자 고유 ID
     * GOOGLE sub
     * KAKAO 사용자 ID
     *
     * LOCAL 회원은 OAuth 계정을 이용해 처음 가입하는 것이 아니므로
     * provider와 마찬가지로 NULL을 허용한다.
     */
    @Column(
            name = "provider_id",
            nullable = true,
            length = 100
    )
    private String providerId;

    /*
     * OAuth 로그인에서 받은 프로필 정보를 갱신한다.
     *
     * 중요한 점:
     *
     * users.name은 이제 단순한 OAuth 이름이 아니라
     * Memory Jar에서 사용하는 "닉네임" 역할을 한다.
     *
     * 따라서 사용자가 직접 닉네임을 변경한 뒤
     * NAVER / GOOGLE / KAKAO로 다시 로그인해도
     * 소셜 서비스의 이름으로 덮어쓰면 안 된다.
     */
    public void updateProfile(
            String email,
            String name,
            String birthyear
    ) {

        /*
         * 이메일은 최신 OAuth 정보를 반영한다.
         */
        if (email != null) {
            this.email = email;
        }


        /*
         * 기존 닉네임이 아예 없는 사용자에게만
         * OAuth 이름을 최초 기본값으로 사용한다.
         *
         * 이미 Memory Jar 닉네임이 있다면
         * 절대로 덮어쓰지 않는다.
         */
        if (
                (this.name == null
                        || this.name.isBlank())
                        &&
                        name != null
                        && !name.isBlank()
        ) {

            this.name = name;
        }


        /*
         * 출생연도는 Provider에서 새 값을 받았을 때 갱신한다.
         */
        if (birthyear != null) {
            this.birthyear = birthyear;
        }
    }


    /*
     * 사용자가 Memory Jar 안에서
     * 직접 닉네임을 변경할 때 사용하는 메서드
     */
    public void changeNickname(
            String nickname
    ) {

        this.name = nickname;
    }
}