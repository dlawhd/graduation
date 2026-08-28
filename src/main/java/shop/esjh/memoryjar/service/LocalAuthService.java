package shop.esjh.memoryjar.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import shop.esjh.memoryjar.dto.auth.response.LoginIdAvailabilityResponse;
import shop.esjh.memoryjar.repository.UserLocalCredentialRepository;

import java.util.Locale;
import java.util.regex.Pattern;

/*
 * LocalAuthService 역할
 *
 * Memory Jar 자체 로그인(LOCAL)에 필요한
 * 회원가입/로그인 관련 비즈니스 로직을 담당하는 서비스야.
 *
 * 기존:
 *
 * NAVER
 * GOOGLE
 * KAKAO
 *
 * 로그인과 별개로 앞으로:
 *
 * 아이디 + 비밀번호
 *
 * 방식의 자체 계정을 담당한다.
 *
 *
 * 현재 단계에서는 첫 번째 기능인:
 *
 * "이 아이디를 사용할 수 있는가?"
 *
 * 만 구현한다.
 *
 * 이후 이 클래스에:
 *
 * 회원가입
 * LOCAL 로그인
 *
 * 기능을 차례대로 추가할 예정이다.
 */
@Service
@Transactional(readOnly = true)
public class LocalAuthService {

    /*
     * Memory Jar 아이디 규칙
     *
     * 허용:
     *
     * eunseo
     * eunseo01
     * memory_jar
     *
     * 조건:
     *
     * - 4~20자
     * - 영문 소문자
     * - 숫자
     * - 밑줄(_)
     *
     * 사용자가 대문자를 입력한 경우에는
     * 아래 normalizeLoginId()에서 먼저 소문자로 바꾼다.
     */
    private static final Pattern LOGIN_ID_PATTERN =
            Pattern.compile(
                    "^[a-z0-9_]{4,20}$"
            );


    private final UserLocalCredentialRepository
            userLocalCredentialRepository;


    /*
     * 생성자 주입
     *
     * Spring이 UserLocalCredentialRepository를
     * 자동으로 넣어준다.
     */
    public LocalAuthService(
            UserLocalCredentialRepository userLocalCredentialRepository
    ) {
        this.userLocalCredentialRepository =
                userLocalCredentialRepository;
    }


    /*
     * 사용자가 입력한 아이디가
     * Memory Jar에서 사용 가능한지 확인한다.
     *
     * 처리 순서:
     *
     * 1. 빈 값인지 검사
     * 2. 앞뒤 공백 제거
     * 3. 소문자로 변환
     * 4. 아이디 형식 검사
     * 5. DB에서 중복 확인
     * 6. 결과 반환
     */
    public LoginIdAvailabilityResponse checkLoginIdAvailability(
            String loginId
    ) {

        /*
         * 사용자가 입력한 아이디를
         * 우리가 DB에 저장할 실제 형태로 정리한다.
         */
        String normalizedLoginId =
                normalizeLoginId(loginId);


        /*
         * soft delete된 LOCAL 계정까지 포함해서 검사한다.
         *
         * 0개:
         * → 한 번도 사용된 적 없는 아이디
         *
         * 1개 이상:
         * → 이미 사용된 아이디
         */
        long existingCount =
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                normalizedLoginId
                        );


        /*
         * 기존 row가 하나도 없을 때만
         * 사용 가능한 아이디다.
         */
        boolean available =
                existingCount == 0;


        return new LoginIdAvailabilityResponse(
                normalizedLoginId,
                available
        );
    }


    /*
     * 사용자가 입력한 아이디를
     * 서버에서 사용하는 표준 형태로 바꾼다.
     *
     * 예:
     *
     * "  EunSeo01  "
     *
     *      ↓
     *
     * "eunseo01"
     *
     *
     * 아이디 대소문자를 구분하지 않기 위해
     * 항상 소문자로 저장하고 비교한다.
     */
    private String normalizeLoginId(
            String loginId
    ) {

        /*
         * null
         * ""
         * "   "
         *
         * 같은 값은 아이디로 사용할 수 없다.
         */
        if (!StringUtils.hasText(loginId)) {
            throw new IllegalArgumentException(
                    "아이디를 입력해 주세요."
            );
        }


        /*
         * trim()
         * → 앞뒤 공백 제거
         *
         * toLowerCase(Locale.ROOT)
         * → 언어 환경의 영향을 받지 않고
         *   안전하게 소문자로 변환
         */
        String normalized =
                loginId
                        .trim()
                        .toLowerCase(Locale.ROOT);


        /*
         * 우리가 정한 아이디 규칙을 검사한다.
         */
        if (!LOGIN_ID_PATTERN
                .matcher(normalized)
                .matches()) {

            throw new IllegalArgumentException(
                    "아이디는 4~20자의 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
            );
        }


        return normalized;
    }
}