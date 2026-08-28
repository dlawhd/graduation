package shop.esjh.memoryjar.repository;

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
     * 나중에 실제 로그인 API에서 가장 중요하게 사용한다.
     *
     * 예:
     *
     * 사용자가:
     *
     * 아이디: eunseo01
     * 비밀번호: ********
     *
     * 를 입력하면 먼저:
     *
     * findByLoginId("eunseo01")
     *
     * 로 Credential을 찾는다.
     */
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