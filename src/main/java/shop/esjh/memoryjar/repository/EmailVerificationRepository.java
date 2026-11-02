package shop.esjh.memoryjar.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.EmailVerification;
import shop.esjh.memoryjar.enums.auth.EmailVerificationPurpose;

import java.util.Optional;
import java.time.LocalDateTime;

/*
 * EmailVerificationRepository 역할
 *
 * email_verifications 테이블을 조회하고 저장하는 Repository야.
 *
 * 주요 역할:
 *
 * 1. 이메일 + 인증 목적 조회
 * 2. 인증번호 재전송 시 row 잠금
 * 3. 이메일 인증 정보 저장
 *
 * save(), findById() 같은 기본 기능은
 * JpaRepository가 자동으로 제공한다.
 */
public interface EmailVerificationRepository
        extends JpaRepository<EmailVerification, Long> {

    /**
     * 아직 행이 없는 첫 요청도 고유 제약을 이용해 한 행에서 순서대로 처리한다.
     * 기존 인증번호·시도 횟수는 건드리지 않는다. 신규 행은 이미 만료된 준비 상태이며,
     * 같은 발급 트랜잭션에서 실제 번호로 갱신하거나 실패 시 함께 롤백한다.
     */
    @Modifying
    @Query(value = """
            INSERT INTO email_verifications
                (email, purpose, code_hash, code_expires_at, attempt_count, last_sent_at, created_at, updated_at)
            VALUES (:email, :purpose, REPEAT('0', 64), :now, 0, :eligibleAt, :now, :now)
            ON DUPLICATE KEY UPDATE verification_id = verification_id
            """, nativeQuery = true)
    void ensureIssuanceRow(@Param("email") String email, @Param("purpose") String purpose,
                           @Param("now") LocalDateTime now, @Param("eligibleAt") LocalDateTime eligibleAt);


    /*
     * 이메일과 인증 목적을 기준으로
     * 인증 정보를 조회한다.
     *
     * 다음 단계에서:
     *
     * 사용자가 입력한 인증번호 확인
     *
     * 기능에 사용할 예정이다.
     */
    Optional<EmailVerification>
    findByEmailAndPurpose(
            String email,
            EmailVerificationPurpose purpose
    );


    /*
     * 인증번호를 재발급할 때
     * 같은 row를 동시에 여러 요청이 변경하지 못하도록
     * 비관적 쓰기 잠금을 건다.
     *
     * 예:
     *
     * 사용자가 "인증번호 다시 받기"를
     * 거의 동시에 두 번 누른 경우
     *
     * 요청 A
     * 요청 B
     *
     * 가 같은 인증정보를 동시에 수정하면
     * 인증번호 상태가 꼬일 수 있다.
     *
     * PESSIMISTIC_WRITE를 사용하면
     * 먼저 들어온 요청이 처리되는 동안
     * 두 번째 요청은 기다리게 된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
           select ev
             from EmailVerification ev
            where ev.email = :email
              and ev.purpose = :purpose
           """)
    Optional<EmailVerification>
    findByEmailAndPurposeForUpdate(
            @Param("email")
            String email,

            @Param("purpose")
            EmailVerificationPurpose purpose
    );
}
