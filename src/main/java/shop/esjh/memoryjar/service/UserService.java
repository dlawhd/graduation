package shop.esjh.memoryjar.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.UserOAuthAccount;
import shop.esjh.memoryjar.policy.NicknamePolicy;
import shop.esjh.memoryjar.repository.UserOAuthAccountRepository;
import shop.esjh.memoryjar.repository.UserRepository;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
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
 * 2. 처음 보는 소셜 ID는 이메일 충돌을 확인한 뒤 새 계정을 만든다.
 * 3. 기존 계정에 로그인 수단을 추가할 때는 별도의 연결 절차를 거친다.
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
                    null,
                    name,
                    birthyear
            );

            return userRepository.save(user);
        }

        // 이메일 일치만으로 기존 계정에 접근 권한을 주지 않는다.
        if (userRepository.findByEmail(email).isPresent()) throw new OAuthLinkRequiredException();

        User user = userRepository.save(User.builder()
                .email(email).name(name).birthyear(birthyear)
                .provider(normalizedProvider).providerId(providerId).build());
        addOAuthAccount(user, normalizedProvider, providerId);
        return user;
    }

    /** 호출한 로그인 세션과 소셜 계정을 확인하고 현재 사용자의 로그인 수단만 추가한다. */
    @Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void linkOAuthAccount(long userId, long version, String sessionId, String provider, String providerId, String email) {
        String normalizedProvider = normalizeProvider(provider);
        User user = userRepository.findByIdForUpdate(userId).orElseThrow(this::linkConflict);
        // 로그아웃·비밀번호 재설정과 같은 사용자 행을 잠근 상태에서 세션을 확인한다.
        if (userRepository.countCurrentSession(userId, version, sessionId,
                LocalDateTime.now(ZoneId.of("Asia/Seoul"))) != 1L) throw linkConflict();
        if (!StringUtils.hasText(providerId) || !StringUtils.hasText(email)
                || !email.equalsIgnoreCase(user.getEmail())) throw linkConflict();

        var linked = userOAuthAccountRepository.findByProviderAndProviderId(normalizedProvider, providerId);
        if (linked.isPresent()) {
            if (!linked.get().getUser().getId().equals(user.getId())) throw linkConflict();
            return;
        }
        if (userOAuthAccountRepository.findByUser_IdAndProvider(userId, normalizedProvider).isPresent()) throw linkConflict();
        addOAuthAccount(user, normalizedProvider, providerId);
    }

    public List<String> connectedOAuthProviders(long userId) {
        return userOAuthAccountRepository.findAllByUser_Id(userId).stream()
                .map(UserOAuthAccount::getProvider).sorted().toList();
    }

    private void addOAuthAccount(User user, String provider, String providerId) {
        userOAuthAccountRepository.save(UserOAuthAccount.builder()
                .user(user).provider(provider).providerId(providerId).build());
    }

    private ResponseStatusException linkConflict() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "소셜 계정을 연결할 수 없습니다.");
    }

    /** 이메일이 이미 등록된 경우에만 호출자에게 명시적 연결 절차를 안내한다. */
    public static final class OAuthLinkRequiredException extends RuntimeException {}

    /*
     * =========================================================
     * 로그인한 사용자 조회
     * =========================================================
     *
     * JWT 안의 name을 그대로 사용하는 대신
     * DB에서 최신 User를 읽는다.
     *
     * 그래야 닉네임 변경 직후 새로고침해도
     * 최신 닉네임이 보인다.
     */
    @Transactional(readOnly = true)
    public User getUser(
            Long userId
    ) {

        return userRepository
                .findById(
                        userId
                )
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "사용자 정보를 찾을 수 없어요."
                                )
                );
    }


    /*
     * =========================================================
     * Memory Jar 닉네임 변경
     * =========================================================
     *
     * LOCAL / NAVER / GOOGLE / KAKAO 여부와 관계없이
     * User 테이블 하나를 수정한다.
     *
     * 그래서 모든 로그인 방식에서
     * 같은 기능을 사용할 수 있다.
     */
    @Transactional
    public User changeNickname(
            Long userId,
            String nickname
    ) {

        /*
         * 공통 닉네임 정책 적용
         */
        String normalizedNickname =
                NicknamePolicy
                        .normalizeAndValidate(
                                nickname
                        );


        /*
         * 현재 로그인 사용자 조회
         */
        User user =
                userRepository
                        .findById(
                                userId
                        )
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "사용자 정보를 찾을 수 없어요."
                                        )
                        );


        /*
         * User 엔티티의 닉네임 변경
         */
        user.changeNickname(
                normalizedNickname
        );


        /*
         * 변경된 User 저장
         */
        return userRepository.save(
                user
        );
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