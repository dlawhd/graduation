package shop.esjh.memoryjar.repository;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.UserLocalCredential;

import java.util.Optional;

/*
 * UserLocalCredentialRepository 역할
 *
 * Memory Jar 자체 로그인 정보를
 * DB에서 저장하고 조회하는 Repository야.
 *
 * 쉽게 말하면:
 *
 * "eunseo01이라는 아이디가 있나?"
 *
 * "eunseo01은 어떤 User의 계정이지?"
 *
 * "이 User는 이미 LOCAL 로그인 계정을 가지고 있나?"
 *
 * 같은 질문을 DB에 해주는 역할이야.
 *
 * save(), delete(), findById() 같은 기본 기능은
 * JpaRepository가 자동으로 제공한다.
 */
public interface UserLocalCredentialRepository
        extends JpaRepository<UserLocalCredential, Long> {


    /*
     * loginId로 LOCAL 로그인 정보를 조회한다.
     *
     * 이 메서드는 실제 LOCAL 로그인에서 사용한다.
     *
     * 중요한 점:
     *
     * UserLocalCredential의 user 관계는
     * 평소에는 LAZY 방식으로 유지하고 있다.
     *
     * 즉, 필요하지 않을 때는 User까지
     * 무조건 조회하지 않아서 불필요한 DB 조회를 줄인다.
     *
     * 하지만 로그인 성공 후에는 Controller에서:
     *
     * - userId
     * - email
     * - name
     * - birthyear
     *
     * 같은 User 정보가 바로 필요하다.
     *
     * 그래서 로그인용 findByLoginId()를 실행할 때만
     * @EntityGraph를 이용해서 User까지 함께 가져온다.
     *
     * 쉽게 말하면:
     *
     * 기존
     * Credential만 조회
     *      ↓
     * User는 나중에 조회
     *      ↓
     * Service 트랜잭션 종료
     *      ↓
     * Controller에서 User 조회 시도
     *      ↓
     * LazyInitializationException
     *
     *
     * 수정 후
     * Credential + User를 로그인 조회에서 함께 가져옴
     *      ↓
     * Service 트랜잭션이 끝나도
     * 이미 User 데이터가 준비되어 있음
     *      ↓
     * Controller에서 email/name 등을 안전하게 사용 가능
     */
    @EntityGraph(
            attributePaths = {
                    "user"
            }
    )
    Optional<UserLocalCredential> findByLoginId(
            String loginId
    );


    /*
     * 같은 loginId가 이미 존재하는지
     * true / false로 확인한다.
     *
     * 주로 회원가입의 아이디 중복 확인에서 사용한다.
     *
     * 예:
     *
     * existsByLoginId("eunseo01")
     *
     * true
     * → 이미 사용 중
     *
     * false
     * → 사용 가능
     */
    boolean existsByLoginId(
            String loginId
    );


    /*
     * 특정 User가 이미 LOCAL 로그인 방법을
     * 가지고 있는지 조회한다.
     *
     * 예:
     *
     * User #10
     *      ↓
     * eunseo01
     *
     * 나중에 소셜 로그인 계정에
     * LOCAL 로그인을 추가하는 기능에서도 사용할 수 있다.
     */
    Optional<UserLocalCredential> findByUser_Id(
            Long userId
    );

    /*
     * 아이디 중복 확인을 할 때
     * soft delete된 LOCAL 계정까지 포함해서 검사하는 메서드야.
     *
     * 왜 일반 existsByLoginId()를 사용하지 않을까?
     *
     * UserLocalCredential에는:
     *
     * @SQLRestriction("deleted_at IS NULL")
     *
     * 이 적용되어 있기 때문에 일반 JPA 조회에서는
     * 삭제된 row가 자동으로 제외될 수 있어.
     *
     * 하지만 DB의 login_id UNIQUE 제약은
     * 삭제된 row도 그대로 포함한다.
     *
     * 그래서:
     *
     * 삭제된 eunseo01 존재
     *      ↓
     * 일반 조회에서는 안 보임
     *      ↓
     * 하지만 DB UNIQUE 때문에 eunseo01 재가입 불가능
     *
     * 같은 문제가 생길 수 있다.
     *
     * 이 Native Query는 Hibernate의 soft delete 조회 조건을 우회하고
     * 실제 user_local_credentials 전체를 검사한다.
     */
    @Query(
            value = """
                SELECT COUNT(*)
                FROM user_local_credentials
                WHERE login_id = :loginId
                """,
            nativeQuery = true
    )
    long countIncludingDeletedByLoginId(
            @Param("loginId") String loginId
    );
}