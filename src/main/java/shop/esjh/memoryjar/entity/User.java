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

    public void updateProfile(String email, String name, String birthyear) {
        // 최신 값으로 업데이트(없으면 유지)
        if (email != null) this.email = email;
        if (name != null) this.name = name;
        if (birthyear != null) this.birthyear = birthyear;
    }
}