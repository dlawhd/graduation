package shop.esjh.memoryjar.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import shop.esjh.memoryjar.dto.request.MeUpdateRequest;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.dto.response.MeResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.service.UserService;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;


/*
 * MeControllerTest 역할
 *
 * 현재 로그인한 사용자의:
 *
 * 1. 내 정보 조회
 * 2. 최신 닉네임 조회
 * 3. 닉네임 변경
 * 4. 잘못된 인증 정보 처리
 *
 * 가 정상적으로 동작하는지 확인하는 테스트야.
 *
 *
 * 중요한 변경점:
 *
 * 예전에는 JWT principal 안에 들어 있던
 * email / name / birthyear 값을 그대로 반환했다.
 *
 * 지금은:
 *
 * JWT에서 userId 확인
 *        ↓
 * UserService를 통해 DB User 조회
 *        ↓
 * DB의 최신 정보를 반환
 *
 * 하는 구조다.
 *
 * 이렇게 해야 사용자가 닉네임을 변경한 뒤에도
 * 오래된 JWT 이름이 아니라 최신 닉네임을 볼 수 있다.
 */
@ExtendWith(MockitoExtension.class)
class MeControllerTest {

    /*
     * 실제 DB를 사용하지 않고
     * 가짜 UserService를 사용한다.
     */
    @Mock
    private UserService userService;


    /*
     * 테스트할 실제 Controller
     */
    private MeController meController;


    /*
     * 각 테스트가 실행되기 전에
     * UserService를 넣어서 MeController를 만든다.
     *
     * 실제 운영 코드의:
     *
     * new MeController(userService)
     *
     * 와 같은 구조다.
     */
    @BeforeEach
    void setUp() {

        meController =
                new MeController(
                        userService
                );
    }


    @Test
    @DisplayName(
            "principal이 Map이면 userId로 DB의 최신 회원정보를 조회해서 반환한다"
    )
    void principal이_Map이면_DB의_최신_회원정보를_반환한다() {

        /*
         * =====================================================
         * given
         * =====================================================
         *
         * JWT 안에는 userId와 예전 사용자 정보가
         * 들어 있다고 가정한다.
         *
         * 여기서 중요한 것은:
         *
         * email/name을 JWT에서 반환하지 않고
         * userId만 꺼내 DB를 조회해야 한다는 것이다.
         */
        Map<String, Object> principal =
                Map.of(
                        "userId", 1L,

                        /*
                         * 일부러 오래된 값을 넣는다.
                         *
                         * 이 값이 응답으로 사용되면
                         * 테스트가 잘못된 것이다.
                         */
                        "email", "old@example.com",
                        "name", "예전닉네임",
                        "birthyear", "1999"
                );


        TestingAuthenticationToken authentication =
                new TestingAuthenticationToken(
                        principal,
                        null
                );


        /*
         * DB에 저장된 최신 User라고 가정한다.
         *
         * User Entity 전체를 실제로 생성하지 않고
         * Mockito mock으로 필요한 값만 설정한다.
         */
        User user =
                mock(
                        User.class
                );


        when(
                user.getId()
        ).thenReturn(
                1L
        );

        when(
                user.getEmail()
        ).thenReturn(
                "user@example.com"
        );

        when(
                user.getName()
        ).thenReturn(
                "은서최신"
        );

        when(
                user.getBirthyear()
        ).thenReturn(
                "2000"
        );


        /*
         * userId = 1을 조회하면
         * 위의 최신 User가 나온다고 설정한다.
         */
        when(
                userService.getUser(
                        1L
                )
        ).thenReturn(
                user
        );


        /*
         * =====================================================
         * when
         * =====================================================
         */
        ApiResponse<MeResponse> result =
                meController.me(
                        authentication
                );


        /*
         * =====================================================
         * then
         * =====================================================
         *
         * JWT의 예전 이름 "예전닉네임"이 아니라
         * DB의 최신 이름 "은서최신"이어야 한다.
         */
        assertThat(
                result.data().userId()
        ).isEqualTo(
                1L
        );

        assertThat(
                result.data().email()
        ).isEqualTo(
                "user@example.com"
        );

        assertThat(
                result.data().name()
        ).isEqualTo(
                "은서최신"
        );

        assertThat(
                result.data().birthyear()
        ).isEqualTo(
                "2000"
        );


        /*
         * Controller가 실제로 userId 1을 이용해서
         * UserService에 조회 요청했는지도 확인한다.
         */
        verify(
                userService
        ).getUser(
                1L
        );
    }


    @Test
    @DisplayName(
            "principal이 Map이 아니어도 숫자 형태 authentication name이면 userId로 사용할 수 있다"
    )
    void principal이_Map이_아니어도_숫자이면_userId로_조회한다() {

        /*
         * =====================================================
         * given
         * =====================================================
         *
         * principal이 Map이 아닌 경우에는
         * authentication.getName()을 사용한다.
         *
         * 여기서는 "2"가 들어 있다고 가정한다.
         */
        TestingAuthenticationToken authentication =
                new TestingAuthenticationToken(
                        "2",
                        null
                );

        authentication.setAuthenticated(
                true
        );


        User user =
                mock(
                        User.class
                );


        when(
                user.getId()
        ).thenReturn(
                2L
        );

        when(
                user.getEmail()
        ).thenReturn(
                "second@example.com"
        );

        when(
                user.getName()
        ).thenReturn(
                "두번째사용자"
        );

        when(
                user.getBirthyear()
        ).thenReturn(
                "2001"
        );


        when(
                userService.getUser(
                        2L
                )
        ).thenReturn(
                user
        );


        /*
         * =====================================================
         * when
         * =====================================================
         */
        ApiResponse<MeResponse> result =
                meController.me(
                        authentication
                );


        /*
         * =====================================================
         * then
         * =====================================================
         */
        assertThat(
                result.data().userId()
        ).isEqualTo(
                2L
        );

        assertThat(
                result.data().name()
        ).isEqualTo(
                "두번째사용자"
        );


        verify(
                userService
        ).getUser(
                2L
        );
    }


    @Test
    @DisplayName(
            "principal에서 숫자 userId를 확인할 수 없으면 401 예외가 발생한다"
    )
    void 숫자가_아닌_principal이면_401_예외가_발생한다() {

        /*
         * =====================================================
         * given
         * =====================================================
         *
         * 기존 테스트에서는:
         *
         * "principal-string"
         *
         * 자체를 userId로 반환했다.
         *
         * 하지만 지금 User의 ID 타입은 Long이므로
         * 이런 문자열은 정상 사용자 ID가 될 수 없다.
         */
        TestingAuthenticationToken authentication =
                new TestingAuthenticationToken(
                        "principal-string",
                        null
                );

        authentication.setAuthenticated(
                true
        );


        /*
         * =====================================================
         * when & then
         * =====================================================
         */
        assertThatThrownBy(
                () ->
                        meController.me(
                                authentication
                        )
        )
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,

                        exception -> {

                            /*
                             * 잘못된 인증 정보이므로
                             * 401 Unauthorized
                             */
                            assertThat(
                                    exception.getStatusCode()
                            ).isEqualTo(
                                    HttpStatus.UNAUTHORIZED
                            );


                            assertThat(
                                    exception.getReason()
                            ).isEqualTo(
                                    "로그인 정보를 확인할 수 없습니다."
                            );
                        }
                );


        /*
         * userId 자체를 만들 수 없으므로
         * DB 조회도 하지 않아야 한다.
         */
        verifyNoInteractions(
                userService
        );
    }


    @Test
    @DisplayName(
            "로그인한 사용자는 자신의 닉네임을 변경할 수 있다"
    )
    void 닉네임_변경에_성공한다() {

        /*
         * =====================================================
         * given
         * =====================================================
         *
         * 현재 로그인 사용자 번호:
         * 1
         */
        Map<String, Object> principal =
                Map.of(
                        "userId",
                        1L
                );


        TestingAuthenticationToken authentication =
                new TestingAuthenticationToken(
                        principal,
                        null
                );


        /*
         * 사용자가 새로 바꾸려는 닉네임
         */
        MeUpdateRequest request =
                new MeUpdateRequest(
                        "새닉네임"
                );


        /*
         * 닉네임 변경이 끝난 뒤의 최신 User
         */
        User updatedUser =
                mock(
                        User.class
                );


        when(
                updatedUser.getId()
        ).thenReturn(
                1L
        );

        when(
                updatedUser.getEmail()
        ).thenReturn(
                "user@example.com"
        );

        when(
                updatedUser.getName()
        ).thenReturn(
                "새닉네임"
        );

        when(
                updatedUser.getBirthyear()
        ).thenReturn(
                "2000"
        );


        /*
         * UserService가 닉네임 변경 요청을 받으면
         * 변경된 User를 반환한다고 설정한다.
         */
        when(
                userService.changeNickname(
                        1L,
                        "새닉네임"
                )
        ).thenReturn(
                updatedUser
        );


        /*
         * =====================================================
         * when
         * =====================================================
         */
        ApiResponse<MeResponse> result =
                meController.updateMe(
                        authentication,
                        request
                );


        /*
         * =====================================================
         * then
         * =====================================================
         */
        assertThat(
                result.data().userId()
        ).isEqualTo(
                1L
        );

        assertThat(
                result.data().name()
        ).isEqualTo(
                "새닉네임"
        );


        /*
         * Controller가 UserService에
         * 정확한 userId + nickname을 전달했는지 확인한다.
         */
        verify(
                userService
        ).changeNickname(
                1L,
                "새닉네임"
        );
    }
}