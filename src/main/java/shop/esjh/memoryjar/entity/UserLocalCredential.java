package shop.esjh.memoryjar.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDateTime;
import java.time.ZoneId;

/*
 * UserLocalCredential 역할
 *
 * Memory Jar 자체 로그인에 사용하는
 * "아이디 + 비밀번호" 정보를 저장하는 엔티티야.
 *
 * 쉽게 생각하면:
 *
 * User
 * = 실제 Memory Jar 사용자
 *
 * UserLocalCredential
 * = 그 사용자가 Memory Jar 자체 로그인에 사용하는 열쇠
 *
 * 예:
 *
 * User
 * id = 10
 * name = 은서
 *
 * UserLocalCredential
 * user_id = 10
 * login_id = eunseo01
 * password_hash = 암호화된 비밀번호
 *
 *
 * 중요한 점:
 *
 * 비밀번호 원문은 절대로 저장하지 않아.
 *
 * 예:
 *
 * Memory1234        X
 *
 * PasswordEncoder를 거친
 * $argon2... 또는 $2a$... 같은 Hash 값만 저장해.
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity

/*
 * Repository의 delete()가 호출돼도
 * 실제 row를 DELETE하지 않고 deleted_at에 시간을 기록한다.
 *
 * 현재 프로젝트의 User, RefreshToken, Note 등과
 * 같은 soft delete 방식을 사용한다.
 */
@SQLDelete(
        sql = """
              UPDATE user_local_credentials
                 SET deleted_at = NOW(6),
                     updated_at = NOW(6)
               WHERE local_credential_id = ?
              """
)

/*
 * 일반 조회에서는 deleted_at 값이 있는
 * 삭제된 LOCAL 로그인 정보를 자동으로 제외한다.
 */
@SQLRestriction("deleted_at IS NULL")

@Table(
        name = "user_local_credentials",

        /*
         * V30에서 만든 DB UNIQUE 제약과
         * JPA 모델도 동일하게 맞춘다.
         */
        uniqueConstraints = {

                /*
                 * 한 User는 LOCAL 로그인 정보를
                 * 하나만 가질 수 있다.
                 */
                @UniqueConstraint(
                        name = "uk_user_local_credentials_user",
                        columnNames = "user_id"
                ),

                /*
                 * loginId는 Memory Jar 전체에서
                 * 중복될 수 없다.
                 */
                @UniqueConstraint(
                        name = "uk_user_local_credentials_login_id",
                        columnNames = "login_id"
                )
        }
)
public class UserLocalCredential extends BaseEntity {

    /*
     * 프로젝트 전체 시간 기준과 동일하게
     * 한국 시간을 사용한다.
     */
    private static final ZoneId KST =
            ZoneId.of("Asia/Seoul");


    /*
     * LOCAL 로그인 정보 하나의 고유 번호야.
     *
     * 예:
     *
     * local_credential_id = 1
     */
    @Id
    @GeneratedValue(
            strategy = GenerationType.IDENTITY
    )
    @Column(
            name = "local_credential_id"
    )
    private Long id;


    /*
     * 이 LOCAL 로그인 정보가
     * 어떤 Memory Jar 사용자의 것인지 연결한다.
     *
     * user_id에는 UNIQUE 제약이 있으므로:
     *
     * User 1명
     *      ↕
     * LocalCredential 최대 1개
     *
     * 관계가 된다.
     *
     * 그래서 ManyToOne이 아니라 OneToOne이 정확하다.
     *
     * LAZY:
     * 실제 User 데이터가 필요할 때 가져와서
     * 불필요한 조회를 줄인다.
     */
    @OneToOne(
            fetch = FetchType.LAZY,
            optional = false
    )
    @JoinColumn(
            name = "user_id",
            nullable = false,
            unique = true,
            foreignKey = @ForeignKey(
                    name = "fk_user_local_credentials_user"
            )
    )
    private User user;


    /*
     * Memory Jar 로그인 화면에서 사용하는 아이디야.
     *
     * 예:
     *
     * eunseo01
     * memory_jar
     *
     * 이메일이 아니라 이 값으로 로그인한다.
     *
     * 최대 길이 20자는 V30 DB 구조와 동일하다.
     */
    @Column(
            name = "login_id",
            nullable = false,
            length = 20
    )
    private String loginId;


    /*
     * 비밀번호를 PasswordEncoder로 Hash한 값이야.
     *
     * 절대로 아래처럼 원본 비밀번호를 저장하면 안 된다.
     *
     * password_hash = "Memory1234"   X
     *
     * 나중에 로그인할 때:
     *
     * passwordEncoder.matches(
     *     사용자가 입력한 비밀번호,
     *     passwordHash
     * )
     *
     * 방식으로 비교할 예정이다.
     */
    @Column(
            name = "password_hash",
            nullable = false,
            length = 255
    )
    private String passwordHash;


    /*
     * 비밀번호가 마지막으로 변경된 시간이야.
     *
     * 최초 회원가입:
     * → Credential 생성 시간
     *
     * 비밀번호 찾기:
     * → 새 비밀번호로 변경한 시간
     *
     * 으로 갱신된다.
     */
    @Column(
            name = "password_changed_at",
            nullable = false
    )
    private LocalDateTime passwordChangedAt;


    /*
     * 새로운 LOCAL 로그인 정보를 만들 때 사용하는 Builder야.
     *
     * Service에서는 나중에:
     *
     * UserLocalCredential.builder()
     *     .user(user)
     *     .loginId("eunseo01")
     *     .passwordHash(encodedPassword)
     *     .build();
     *
     * 형태로 사용할 예정이다.
     */
    @Builder
    private UserLocalCredential(
            User user,
            String loginId,
            String passwordHash
    ) {

        this.user = user;
        this.loginId = loginId;
        this.passwordHash = passwordHash;

        /*
         * LOCAL 로그인 정보가 처음 만들어진 순간을
         * 최초 비밀번호 설정 시간으로 기록한다.
         */
        this.passwordChangedAt =
                LocalDateTime.now(KST);
    }


    /*
     * 나중에 "비밀번호 찾기 / 재설정" 기능에서
     * 새로운 Hash 비밀번호로 변경할 때 사용할 메서드야.
     *
     * 비밀번호를 바꾸면
     * passwordChangedAt도 같이 갱신한다.
     */
    public void changePassword(
            String newPasswordHash
    ) {

        this.passwordHash =
                newPasswordHash;

        this.passwordChangedAt =
                LocalDateTime.now(KST);
    }
}