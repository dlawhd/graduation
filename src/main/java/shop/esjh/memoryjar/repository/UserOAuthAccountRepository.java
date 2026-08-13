package shop.esjh.memoryjar.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import shop.esjh.memoryjar.entity.UserOAuthAccount;

import java.util.Optional;

/*
 * UserOAuthAccountRepository 역할
 *
 * user_oauth_accounts 테이블에서
 * NAVER / GOOGLE 로그인 계정 정보를 조회하고 저장하는 Repository야.
 *
 * 쉽게 말하면:
 *
 * "이 Google 계정은 어떤 Memory Jar 사용자와 연결되어 있지?"
 * "이 Naver 계정은 이미 연결된 적이 있나?"
 *
 * 를 DB에서 찾아주는 역할을 해.
 *
 * 실제 INSERT, UPDATE 같은 기본 저장 기능은
 * JpaRepository가 자동으로 제공해준다.
 */
public interface UserOAuthAccountRepository
        extends JpaRepository<UserOAuthAccount, Long> {

    /*
     * OAuth Provider와 Provider의 사용자 고유 ID를 이용해서
     * 연결된 OAuth 계정 하나를 찾는다.
     *
     * 예:
     *
     * provider   = "GOOGLE"
     * providerId = Google의 sub 값
     *
     * 또는
     *
     * provider   = "NAVER"
     * providerId = 네이버의 id 값
     *
     * DB에서는 대략 아래와 같은 조건으로 찾는다고 생각하면 돼.
     *
     * SELECT *
     * FROM user_oauth_accounts
     * WHERE provider = ?
     *   AND provider_id = ?;
     *
     * provider + provider_id에는 UNIQUE 제약을 둘 예정이므로
     * 결과는 최대 1개만 나온다.
     */
    Optional<UserOAuthAccount> findByProviderAndProviderId(
            String provider,
            String providerId
    );

    /*
     * 특정 Memory Jar 사용자가 특정 로그인 제공자를
     * 이미 연결했는지 확인할 때 사용할 조회 메서드야.
     *
     * 예:
     *
     * userId = 1
     * provider = "GOOGLE"
     *
     * → 1번 사용자가 Google 계정을 이미 연결했는지 조회
     *
     * 지금 당장 로그인 조회의 핵심은 위의
     * findByProviderAndProviderId()지만,
     * 계정 연결 과정의 중복 확인과 이후
     * "연결된 로그인 수단" 기능에서도 사용할 수 있어서 함께 둔다.
     */
    Optional<UserOAuthAccount> findByUser_IdAndProvider(
            Long userId,
            String provider
    );
}