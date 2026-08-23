package shop.esjh.memoryjar.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserOAuthAccount;
import shop.esjh.memoryjar.repository.UserOAuthAccountRepository;
import shop.esjh.memoryjar.repository.UserRepository;

import java.util.Locale;

/*
 * UserService 역할
 *
 * NAVER / GOOGLE / KAKAO 같은 OAuth 로그인 정보를
 * Memory Jar의 실제 사용자(User)와 연결해주는 서비스다.
 *
 * 중요한 구조:
 *
 * User
 * = Memory Jar에서의 "한 사람"
 *
 * UserOAuthAccount
 * = 그 사람이 사용할 수 있는 소셜 로그인 수단
 *
 * 예:
 *
 * User 1명
 *   ├─ NAVER 계정
 *   ├─ GOOGLE 계정
 *   └─ KAKAO 계정
 *
 * 따라서 같은 사용자가 NAVER / GOOGLE / KAKAO 중
 * 어떤 방법으로 로그인하더라도 같은 Memory Jar 회원으로
 * 연결될 수 있다.
 *
 * 연결 순서:
 *
 * 1. Provider + ProviderId로 이미 연결된 OAuth 계정인지 확인
 * 2. 처음 사용하는 OAuth 계정이면 같은 이메일의 User를 확인
 * 3. 같은 이메일의 User가 있으면 그 User에 새로운 OAuth 계정을 연결
 * 4. User도 없다면 새로운 User와 OAuth 계정을 생성
 */
@Service
public class UserService {

    // Memory Jar 사용자 정보를 조회하고 저장한다.
    private final UserRepository userRepository;

    // 사용자에게 연결된 NAVER / GOOGLE / KAKAO OAuth 계정을 조회하고 저장한다.
    private final UserOAuthAccountRepository userOAuthAccountRepository;

    /*
     * 필요한 Repository들을 Spring이 주입해준다.
     */
    public UserService(
            UserRepository userRepository,
            UserOAuthAccountRepository userOAuthAccountRepository
    ) {
        this.userRepository = userRepository;
        this.userOAuthAccountRepository = userOAuthAccountRepository;
    }

    /*
     * OAuth 로그인을 Memory Jar 사용자와 연결한다.
     *
     * provider 예:
     * NAVER
     * GOOGLE
     * KAKAO
     *
     * providerId 예:
     *
     * NAVER
     * → 네이버에서 내려주는 사용자 id
     *
     * GOOGLE
     * → Google에서 내려주는 sub
     *
     * KAKAO
     * → 카카오에서 내려주는 사용자 id
     *
     * Provider마다 사용자 ID 이름이나 자료형은 다를 수 있지만,
     * OAuth2SuccessHandler에서 최종적으로 String 형태로 통일해서
     * 이 메서드에 전달한다.
     */
    @Transactional
    public User findOrCreateOAuthUser(
            String provider,
            String providerId,
            String email,
            String name,
            String birthyear
    ) {

        // naver / google / kakao처럼 제각각 들어오는 값을
        // DB에서는 NAVER / GOOGLE / KAKAO 형태로 통일한다.
        String normalizedProvider = normalizeProvider(provider);

        /*
         * providerId는 각 OAuth 서비스에서 사용자를 구분하는
         * 가장 중요한 고유 식별값이다.
         */
        if (!StringUtils.hasText(providerId)) {
            throw new IllegalArgumentException(
                    "소셜 로그인 사용자 ID가 비어 있습니다."
            );
        }

        /*
         * 현재 Memory Jar는 이메일을 회원 연결 및 표시 정보로 사용하므로
         * 이메일을 받지 못하면 로그인 진행을 중단한다.
         */
        if (!StringUtils.hasText(email)) {
            throw new IllegalArgumentException(
                    "소셜 로그인 이메일이 비어 있습니다."
            );
        }

        /*
         * 1단계.
         *
         * 먼저 OAuth 계정 자체가 이미 연결되어 있는지 확인한다.
         *
         * 예:
         *
         * GOOGLE + google-123
         * KAKAO  + kakao-456
         *
         * 같은 Provider + ProviderId 조합이 이미 존재한다면
         * 이전에 해당 소셜 계정으로 로그인했던 사용자라는 뜻이다.
         */
        UserOAuthAccount existingOAuthAccount =
                userOAuthAccountRepository
                        .findByProviderAndProviderId(
                                normalizedProvider,
                                providerId
                        )
                        .orElse(null);

        /*
         * 이미 연결된 OAuth 계정이라면
         * 연결되어 있는 기존 User를 그대로 사용한다.
         */
        if (existingOAuthAccount != null) {

            User user = existingOAuthAccount.getUser();

            // 로그인할 때 받은 최신 프로필 정보로 갱신한다.
            user.updateProfile(
                    email,
                    name,
                    birthyear
            );

            return userRepository.save(user);
        }

        /*
         * 2단계.
         *
         * OAuth 계정 연결 기록은 없지만,
         * 같은 이메일을 사용하는 Memory Jar 회원이 있는지 확인한다.
         *
         * 예:
         *
         * 기존:
         * 은서
         * └─ NAVER
         *    └─ abc@gmail.com
         *
         * 처음 KAKAO 로그인:
         * KAKAO
         * └─ abc@gmail.com
         *
         * 이메일이 같다면 새로운 User를 또 만들지 않고
         * 기존 은서 User를 찾아서 KAKAO 계정을 연결한다.
         *
         * GOOGLE도 같은 방식으로 동작한다.
         */
        User user = userRepository
                .findByEmail(email)
                .orElse(null);

        /*
         * 3단계.
         *
         * 같은 이메일의 기존 회원도 없다면
         * Memory Jar에 처음 들어온 사용자이므로 새 User를 만든다.
         */
        if (user == null) {

            user = User.builder()
                    .email(email)
                    .name(name)
                    .birthyear(birthyear)

                    /*
                     * 기존 users.provider / provider_id 컬럼은
                     * 현재 프로젝트의 기존 코드와 테스트 호환성을 위해
                     * 당장은 유지한다.
                     *
                     * 새 사용자의 "첫 로그인 Provider"를 여기에 기록한다.
                     *
                     * 실제 여러 OAuth 계정 연결 정보는
                     * 아래 UserOAuthAccount에서 관리한다.
                     */
                    .provider(normalizedProvider)
                    .providerId(providerId)
                    .build();

            // 새 Memory Jar 회원을 먼저 저장한다.
            user = userRepository.save(user);

        } else {

            /*
             * 기존 회원을 발견했다면
             * 로그인에서 받은 최신 프로필 정보로 갱신한다.
             *
             * 기존 provider / providerId는 변경하지 않는다.
             *
             * 예:
             * NAVER로 처음 가입했다면
             * users.provider는 NAVER 그대로 유지한다.
             */
            user.updateProfile(
                    email,
                    name,
                    birthyear
            );

            user = userRepository.save(user);
        }

        /*
         * 4단계.
         *
         * 이번에 로그인한 OAuth 계정을
         * 찾은 Memory Jar User에게 새로 연결한다.
         *
         * 예:
         *
         * user_id = 1
         *
         * 기존:
         * NAVER + naver-123
         *
         * 이번 로그인:
         * GOOGLE + google-456
         *
         * 결과:
         *
         * user_id 1
         * ├─ NAVER
         * └─ GOOGLE
         */
        UserOAuthAccount newOAuthAccount =
                UserOAuthAccount.builder()
                        .user(user)
                        .provider(normalizedProvider)
                        .providerId(providerId)
                        .build();

        userOAuthAccountRepository.save(newOAuthAccount);

        // 어느 로그인 수단을 사용했든 최종적으로 같은 User를 반환한다.
        return user;
    }

    /*
     * OAuth Provider 이름을 DB에서 사용하는 형태로 통일한다.
     *
     * naver  -> NAVER
     * google -> GOOGLE
     * kakao  -> KAKAO
     *
     * Provider 이름의 대소문자가 제각각 저장되면
     * 같은 Provider인데도 다른 값처럼 취급될 수 있기 때문에
     * 항상 대문자로 통일한다.
     */
    private String normalizeProvider(String provider) {

        // Provider 이름 자체가 없으면 정상적인 OAuth 로그인이 아니다.
        if (!StringUtils.hasText(provider)) {
            throw new IllegalArgumentException(
                    "소셜 로그인 Provider가 비어 있습니다."
            );
        }

        // 대소문자 차이로 데이터가 섞이지 않도록 대문자로 통일한다.
        String normalized =
                provider.toUpperCase(Locale.ROOT);

        /*
         * 현재 Memory Jar에서 공식적으로 지원하는
         * OAuth 로그인 Provider만 허용한다.
         *
         * 다른 문자열이 실수로 DB에 저장되지 않도록
         * 여기에서 한 번 더 제한한다.
         */
        return switch (normalized) {

            /*
             * NAVER / GOOGLE / KAKAO는
             * Memory Jar에서 지원하는 로그인 방식이다.
             *
             * 이미 위에서 대문자로 통일했으므로
             * 그대로 반환하면 된다.
             */
            case "NAVER", "GOOGLE", "KAKAO" -> normalized;

            /*
             * 등록하지 않은 Provider가 들어오면
             * 잘못된 OAuth 계정 데이터가 DB에 저장되지 않도록 중단한다.
             */
            default -> throw new IllegalArgumentException(
                    "지원하지 않는 소셜 로그인 Provider입니다: "
                            + provider
            );
        };
    }
}