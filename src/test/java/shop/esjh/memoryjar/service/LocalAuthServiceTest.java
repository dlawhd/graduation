package shop.esjh.memoryjar.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.dto.auth.response.LoginIdAvailabilityResponse;
import shop.esjh.memoryjar.repository.UserLocalCredentialRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/*
 * LocalAuthServiceTest 역할
 *
 * Memory Jar 자체 로그인 서비스의
 * 아이디 중복 확인 로직을 테스트한다.
 *
 * 확인하는 내용:
 *
 * 1. 사용하지 않은 아이디 → available = true
 * 2. 이미 사용된 아이디 → available = false
 * 3. 대문자/공백 → 소문자로 정규화
 * 4. 잘못된 아이디 → 400으로 바뀔 IllegalArgumentException 발생
 */
@ExtendWith(MockitoExtension.class)
class LocalAuthServiceTest {

    @Mock
    private UserLocalCredentialRepository
            userLocalCredentialRepository;

    @InjectMocks
    private LocalAuthService localAuthService;


    @Test
    @DisplayName("한 번도 사용되지 않은 아이디는 사용 가능하다")
    void availableLoginId_returnsTrue() {

        // given
        when(
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                "eunseo01"
                        )
        ).thenReturn(0L);


        // when
        LoginIdAvailabilityResponse response =
                localAuthService
                        .checkLoginIdAvailability(
                                "eunseo01"
                        );


        // then
        assertThat(
                response.loginId()
        ).isEqualTo(
                "eunseo01"
        );

        assertThat(
                response.available()
        ).isTrue();
    }


    @Test
    @DisplayName("이미 사용된 아이디는 사용할 수 없다")
    void duplicatedLoginId_returnsFalse() {

        // given
        when(
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                "eunseo01"
                        )
        ).thenReturn(1L);


        // when
        LoginIdAvailabilityResponse response =
                localAuthService
                        .checkLoginIdAvailability(
                                "eunseo01"
                        );


        // then
        assertThat(
                response.available()
        ).isFalse();
    }


    @Test
    @DisplayName("아이디는 앞뒤 공백을 제거하고 소문자로 검사한다")
    void loginId_isNormalized() {

        // given
        when(
                userLocalCredentialRepository
                        .countIncludingDeletedByLoginId(
                                "eunseo01"
                        )
        ).thenReturn(0L);


        // when
        LoginIdAvailabilityResponse response =
                localAuthService
                        .checkLoginIdAvailability(
                                "  EunSeo01  "
                        );


        // then
        assertThat(
                response.loginId()
        ).isEqualTo(
                "eunseo01"
        );

        /*
         * Repository에도 정리된 아이디가
         * 전달됐는지 확인한다.
         */
        verify(
                userLocalCredentialRepository
        ).countIncludingDeletedByLoginId(
                "eunseo01"
        );
    }


    @Test
    @DisplayName("아이디가 비어 있으면 예외가 발생한다")
    void blankLoginId_throwsException() {

        assertThatThrownBy(
                () -> localAuthService
                        .checkLoginIdAvailability(
                                "   "
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                )
                .hasMessage(
                        "아이디를 입력해 주세요."
                );

        /*
         * 형식 자체가 잘못됐으므로
         * DB까지 조회할 필요가 없다.
         */
        verifyNoInteractions(
                userLocalCredentialRepository
        );
    }


    @Test
    @DisplayName("허용하지 않는 문자가 포함된 아이디는 예외가 발생한다")
    void invalidLoginId_throwsException() {

        assertThatThrownBy(
                () -> localAuthService
                        .checkLoginIdAvailability(
                                "은서!!"
                        )
        )
                .isInstanceOf(
                        IllegalArgumentException.class
                );

        verifyNoInteractions(
                userLocalCredentialRepository
        );
    }
}