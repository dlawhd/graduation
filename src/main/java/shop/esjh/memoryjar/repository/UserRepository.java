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
}