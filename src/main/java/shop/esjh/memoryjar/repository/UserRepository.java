package shop.esjh.memoryjar.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByProviderAndProviderId(String provider, String providerId);

    Optional<User> findByEmail(String email);

    /*
     * 사용자 행을 비관적 잠금으로 조회한다.
     *
     * 쉽게 말하면:
     * 온보딩 상태를 저장하는 아주 짧은 순간 동안
     * 동일 사용자의 다른 저장 요청이 먼저 끝날 때까지 기다리게 한다.
     *
     * 이 잠금으로 동일 사용자의 같은 온보딩 기록이
     * 동시에 두 개 생성되는 상황을 예방한다.
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