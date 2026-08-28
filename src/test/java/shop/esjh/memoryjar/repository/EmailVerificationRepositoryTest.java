package shop.esjh.memoryjar.repository;

import jakarta.persistence.PersistenceException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.EmailVerification;
import shop.esjh.memoryjar.enums.auth.EmailVerificationPurpose;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/*
 * EmailVerificationRepositoryTest 역할
 *
 * V30에서 만든 email_verifications 테이블과
 * EmailVerification Entity/Repository가
 * 실제 MariaDB에서 정상 연결되는지 검사한다.
 */
@DataJpaTest(
        properties = "spring.jpa.hibernate.ddl-auto=none"
)
@Testcontainers
@AutoConfigureTestDatabase(
        replace = AutoConfigureTestDatabase.Replace.NONE
)
@Import(JpaAuditConfig.class)
class EmailVerificationRepositoryTest
        extends AbstractMariaDbRepositoryTest {

    @Autowired
    private EmailVerificationRepository
            emailVerificationRepository;


    @Test
    @DisplayName("이메일과 목적을 기준으로 인증 정보를 조회할 수 있다")
    void findByEmailAndPurpose_returnsVerification() {

        // given
        LocalDateTime now =
                LocalDateTime.now();

        EmailVerification verification =
                EmailVerification.issue(
                        "eunseo@naver.com",
                        EmailVerificationPurpose.SIGNUP,
                        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                                + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        now.plusMinutes(5),
                        now
                );

        emailVerificationRepository.saveAndFlush(
                verification
        );

        flushAndClear();


        // when
        EmailVerification result =
                emailVerificationRepository
                        .findByEmailAndPurpose(
                                "eunseo@naver.com",
                                EmailVerificationPurpose.SIGNUP
                        )
                        .orElseThrow();


        // then
        assertThat(
                result.getEmail()
        ).isEqualTo(
                "eunseo@naver.com"
        );

        assertThat(
                result.getPurpose()
        ).isEqualTo(
                EmailVerificationPurpose.SIGNUP
        );

        assertThat(
                result.getAttemptCount()
        ).isZero();

        assertThat(
                result.getCreatedAt()
        ).isNotNull();

        assertThat(
                result.getUpdatedAt()
        ).isNotNull();
    }


    @Test
    @DisplayName("같은 이메일과 같은 인증 목적은 두 개 저장할 수 없다")
    void sameEmailAndPurpose_isRejected() {

        // given
        LocalDateTime now =
                LocalDateTime.now();

        EmailVerification first =
                EmailVerification.issue(
                        "same@example.com",
                        EmailVerificationPurpose.SIGNUP,
                        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                                + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        now.plusMinutes(5),
                        now
                );

        emailVerificationRepository.saveAndFlush(
                first
        );


        // when & then
        assertThatThrownBy(() -> {

            EmailVerification duplicate =
                    EmailVerification.issue(
                            "same@example.com",
                            EmailVerificationPurpose.SIGNUP,
                            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                                    + "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                            now.plusMinutes(5),
                            now
                    );

            entityManager.persist(
                    duplicate
            );

            entityManager.flush();
        })
                .isInstanceOf(
                        PersistenceException.class
                );
    }


    @Test
    @DisplayName("같은 이메일이어도 인증 목적이 다르면 각각 저장할 수 있다")
    void sameEmailDifferentPurpose_isAllowed() {

        // given
        LocalDateTime now =
                LocalDateTime.now();

        EmailVerification signup =
                EmailVerification.issue(
                        "same-purpose@example.com",
                        EmailVerificationPurpose.SIGNUP,
                        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                                + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        now.plusMinutes(5),
                        now
                );

        EmailVerification passwordReset =
                EmailVerification.issue(
                        "same-purpose@example.com",
                        EmailVerificationPurpose.PASSWORD_RESET,
                        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                                + "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                        now.plusMinutes(5),
                        now
                );


        // when
        emailVerificationRepository.saveAndFlush(
                signup
        );

        emailVerificationRepository.saveAndFlush(
                passwordReset
        );

        flushAndClear();


        // then
        assertThat(
                emailVerificationRepository
                        .findByEmailAndPurpose(
                                "same-purpose@example.com",
                                EmailVerificationPurpose.SIGNUP
                        )
        ).isPresent();

        assertThat(
                emailVerificationRepository
                        .findByEmailAndPurpose(
                                "same-purpose@example.com",
                                EmailVerificationPurpose.PASSWORD_RESET
                        )
        ).isPresent();
    }
}