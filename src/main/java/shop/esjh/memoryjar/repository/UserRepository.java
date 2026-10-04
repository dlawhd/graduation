package shop.esjh.memoryjar.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.User;

import java.util.Optional;

/*
 * UserRepository 역할
 *
 * Memory Jar 사용자(User)를 DB에서 조회하고 저장하는 Repository야.
 *
 * OAuth 로그인 계정 조회는 이제
 * UserOAuthAccountRepository가 담당한다.
 *
 * UserRepository는 실제 서비스 사용자 자체를
 * email, id 등의 기준으로 조회하는 역할에 집중한다.
 */
public interface UserRepository extends JpaRepository<User, Long> {

    // 인증 검사에는 사용자 전체나 연관 엔티티 대신 숫자 한 개만 조회한다.
    @Query("select u.sessionVersion from User u where u.id = :userId")
    Optional<Long> findSessionVersionById(@Param("userId") Long userId);

    // 로그인 트랜잭션의 오래된 스냅샷/엔티티를 피하고, 잠근 행의 최신 버전을 읽는다.
    @Query(value = "SELECT session_version FROM users WHERE id = :userId AND deleted_at IS NULL FOR UPDATE", nativeQuery = true)
    Optional<Long> findSessionVersionByIdForUpdate(@Param("userId") Long userId);

    // 영속성 컨텍스트에 예전 User가 있어도 DB의 현재 버전을 원자적으로 증가시킨다.
    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true)
    @Query("update User u set u.sessionVersion = u.sessionVersion + 1 where u.id = :userId")
    int incrementSessionVersion(@Param("userId") Long userId);

    /*
     * 이메일로 Memory Jar 사용자를 찾는다.
     *
     * 처음 연결되지 않은 NAVER / GOOGLE OAuth 계정이 들어왔을 때
     * 같은 이메일의 기존 User가 있는지 확인하는 데 사용한다.
     */
    Optional<User> findByEmail(String email);

    /*
     * 사용자 행을 비관적 잠금으로 조회한다.
     *
     * 온보딩 상태를 저장하는 짧은 순간 동안
     * 같은 사용자의 다른 저장 요청과 충돌하지 않도록 한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
           select u
             from User u
            where u.id = :userId
           """)
    Optional<User> findByIdForUpdate(
            @Param("userId") Long userId
    );

    /*
     * LOCAL 회원가입 시 이메일 중복 여부를
     * soft delete된 사용자까지 포함해서 검사한다.
     *
     * users.email에는 DB UNIQUE 제약이 있기 때문에
     * 삭제된 row도 포함해서 확인해야
     * 나중에 DB UNIQUE 오류가 500으로 터지는 것을 막을 수 있다.
     */
    @Query(
            value = """
                SELECT COUNT(*)
                FROM users
                WHERE email = :email
                """,
            nativeQuery = true
    )
    long countIncludingDeletedByEmail(
            @Param("email")
            String email
    );
}
