package shop.esjh.memoryjar.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import shop.esjh.memoryjar.enums.auth.EmailVerificationPurpose;

import java.time.LocalDateTime;

/*
 * EmailVerification 역할
 *
 * Memory Jar 회원가입과 비밀번호 재설정에서 사용하는
 * 이메일 인증 상태를 저장하는 엔티티야.
 *
 * 예:
 *
 * 사용자가:
 *
 * eunseo@naver.com
 *
 * 을 입력하고 인증번호 받기를 누르면 서버가:
 *
 * 482193
 *
 * 같은 6자리 인증번호를 만들어.
 *
 * 하지만 DB에는:
 *
 * 482193
 *
 * 을 그대로 넣지 않고 Hash 값만 저장해.
 *
 *
 * 쉽게 보면:
 *
 * 이메일
 * eunseo@naver.com
 *
 * 인증번호
 * 482193
 *
 *        ↓ Hash
 *
 * DB
 * 19af8287....
 *
 *
 * 그리고 인증번호가 언제 만료되는지,
 * 인증에 성공했는지,
 * 몇 번 틀렸는지도 함께 관리한다.
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@EntityListeners(AuditingEntityListener.class)
@Table(
        name = "email_verifications",

        /*
         * 같은 이메일 + 같은 인증 목적은
         * 하나의 row만 사용한다.
         *
         * 예:
         *
         * eunseo@naver.com + SIGNUP
         *
         * 은 하나만 존재한다.
         *
         * 인증번호 재전송 시 새 row를 계속 만드는 것이 아니라
         * 기존 row를 갱신한다.
         */
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_email_verifications_email_purpose",
                        columnNames = {
                                "email",
                                "purpose"
                        }
                )
        },
        indexes = {

                /*
                 * 만료된 인증번호 정리용 인덱스
                 */
                @Index(
                        name = "idx_email_verifications_code_expires_at",
                        columnList = "code_expires_at"
                ),

                /*
                 * 인증 성공 후 사용기한이 지난 데이터
                 * 정리용 인덱스
                 */
                @Index(
                        name = "idx_email_verifications_verification_expires_at",
                        columnList = "verification_expires_at"
                )
        }
)
public class EmailVerification {

    /*
     * 인증 요청 하나의 고유 번호
     */
    @Id
    @GeneratedValue(
            strategy = GenerationType.IDENTITY
    )
    @Column(
            name = "verification_id"
    )
    private Long id;


    /*
     * 인증번호를 받을 이메일 주소
     *
     * 서버에서:
     *
     * trim()
     * 소문자 변환
     *
     * 을 적용한 뒤 저장할 예정이다.
     */
    @Column(
            name = "email",
            nullable = false,
            length = 255
    )
    private String email;


    /*
     * 이메일 인증 목적
     *
     * SIGNUP
     * PASSWORD_RESET
     *
     * Enum 이름 그대로 DB 문자열로 저장한다.
     */
    @Enumerated(EnumType.STRING)
    @Column(
            name = "purpose",
            nullable = false,
            length = 30
    )
    private EmailVerificationPurpose purpose;


    /*
     * 실제 6자리 인증번호의 Hash 값
     *
     * 실제:
     *
     * 482193
     *
     * DB:
     *
     * a1b2c3d4....
     *
     * HMAC-SHA256 결과를 16진수로 바꾸면
     * 정확히 64글자가 되기 때문에 CHAR(64)를 사용한다.
     */
    @Column(
            name = "code_hash",
            nullable = false,
            columnDefinition = "CHAR(64)"
    )
    private String codeHash;


    /*
     * 현재 인증번호를 사용할 수 있는 마지막 시간
     *
     * 우리가 정한 정책:
     *
     * 인증번호 발급
     *      ↓
     * 5분 동안 사용 가능
     */
    @Column(
            name = "code_expires_at",
            nullable = false
    )
    private LocalDateTime codeExpiresAt;


    /*
     * 사용자가 인증번호를 정확하게 입력해서
     * 이메일 인증에 성공한 시간
     *
     * 아직 인증 전이면 NULL
     */
    @Column(
            name = "verified_at"
    )
    private LocalDateTime verifiedAt;


    /*
     * 이메일 인증에 성공했을 때 나중에 만들
     * "인증 완료 토큰"의 Hash를 저장하는 컬럼이야.
     *
     * 이번 단계에서는 아직 사용하지 않고 NULL 상태로 둔다.
     *
     * 다음 인증번호 확인 단계에서 사용한다.
     */
    @Column(
            name = "verification_token_hash",
            columnDefinition = "CHAR(64)"
    )
    private String verificationTokenHash;


    /*
     * 이메일 인증 성공 결과를
     * 최종 회원가입에서 언제까지 사용할 수 있는지 저장한다.
     *
     * 이번 단계에서는 아직 NULL이다.
     */
    @Column(
            name = "verification_expires_at"
    )
    private LocalDateTime verificationExpiresAt;


    /*
     * 이미 회원가입이나 비밀번호 재설정에
     * 사용된 인증인지 기록한다.
     *
     * 아직 사용하지 않았다면 NULL
     */
    @Column(
            name = "consumed_at"
    )
    private LocalDateTime consumedAt;


    /*
     * 인증번호를 틀린 횟수
     *
     * 최초 발급:
     *
     * 0
     *
     * 틀리면:
     *
     * 1
     * 2
     * 3
     * ...
     *
     * 나중에 일정 횟수 이상 실패하면
     * 인증을 막는 데 사용한다.
     */
    @Column(
            name = "attempt_count",
            nullable = false
    )
    private int attemptCount;


    /*
     * 마지막 인증번호 발송 시간
     *
     * 이 시간을 이용해서:
     *
     * "인증번호는 60초 후 다시 받을 수 있어요."
     *
     * 를 구현한다.
     */
    @Column(
            name = "last_sent_at",
            nullable = false
    )
    private LocalDateTime lastSentAt;


    /*
     * DB row가 처음 만들어진 시간
     *
     * JpaAuditConfig가 한국 시간으로 자동 입력한다.
     */
    @CreatedDate
    @Column(
            name = "created_at",
            nullable = false,
            updatable = false
    )
    private LocalDateTime createdAt;


    /*
     * row가 마지막으로 갱신된 시간
     *
     * 인증번호를 재발급하면 자동으로 갱신된다.
     */
    @LastModifiedDate
    @Column(
            name = "updated_at",
            nullable = false
    )
    private LocalDateTime updatedAt;


    /*
     * 최초 인증번호 발급 시 사용할 생성 메서드
     *
     * Service에서만 필요한 값들을 넘겨받아
     * 안전한 초기 상태를 만든다.
     */
    public static EmailVerification issue(
            String email,
            EmailVerificationPurpose purpose,
            String codeHash,
            LocalDateTime codeExpiresAt,
            LocalDateTime sentAt
    ) {

        EmailVerification verification =
                new EmailVerification();

        verification.email =
                email;

        verification.purpose =
                purpose;

        verification.codeHash =
                codeHash;

        verification.codeExpiresAt =
                codeExpiresAt;

        verification.lastSentAt =
                sentAt;

        /*
         * 인증번호를 처음 발급했으므로
         * 틀린 횟수는 0에서 시작한다.
         */
        verification.attemptCount =
                0;

        return verification;
    }


    /*
     * 인증번호를 다시 보낼 때 사용한다.
     *
     * 새 row를 만들지 않고 기존 row를 재사용한다.
     *
     * 재발급되면:
     *
     * 이전 인증번호
     * 이전 인증 성공 상태
     * 이전 인증 완료 토큰
     * 실패 횟수
     *
     * 를 모두 초기화한다.
     */
    public void reissue(
            String newCodeHash,
            LocalDateTime newCodeExpiresAt,
            LocalDateTime sentAt
    ) {

        this.codeHash =
                newCodeHash;

        this.codeExpiresAt =
                newCodeExpiresAt;

        this.lastSentAt =
                sentAt;

        /*
         * 새 인증번호가 발급되었으므로
         * 이전 인증 상태를 모두 없앤다.
         */
        this.verifiedAt =
                null;

        this.verificationTokenHash =
                null;

        this.verificationExpiresAt =
                null;

        this.consumedAt =
                null;

        this.attemptCount =
                0;
    }


    /*
     * 마지막 발송 이후 재전송 대기시간이 지났는지 확인한다.
     *
     * 예:
     *
     * 15:00:00 발송
     * cooldown = 60초
     *
     * 15:00:30
     * → false
     *
     * 15:01:00 이후
     * → true
     */
    public boolean canResend(
            LocalDateTime now,
            long cooldownSeconds
    ) {

        return !now.isBefore(
                lastSentAt.plusSeconds(
                        cooldownSeconds
                )
        );
    }


    /*
     * 나중에 인증번호 확인 단계에서
     * 틀린 횟수를 1 증가시킬 때 사용한다.
     */
    public void increaseAttemptCount() {
        this.attemptCount++;
    }


    /*
     * 현재 인증번호가 만료됐는지 확인한다.
     *
     * 다음 단계의 인증번호 확인 기능에서 사용한다.
     */
    public boolean isCodeExpired(
            LocalDateTime now
    ) {

        return !now.isBefore(
                codeExpiresAt
        );
    }

    /*
     * 이메일 인증번호 확인에 성공했을 때 호출한다.
     *
     * 인증 완료 시각,
     * verificationToken Hash,
     * 회원가입에서 사용할 수 있는 만료시간을 저장한다.
     */
    public void markVerified(
            String verificationTokenHash,
            LocalDateTime verifiedAt,
            LocalDateTime verificationExpiresAt
    ) {

        this.verifiedAt =
                verifiedAt;

        this.verificationTokenHash =
                verificationTokenHash;

        this.verificationExpiresAt =
                verificationExpiresAt;

        /*
         * 새 인증 성공 상태이므로
         * 아직 사용되지 않은 상태로 만든다.
         */
        this.consumedAt =
                null;
    }


    /*
     * 인증 완료 토큰의 사용 가능 시간이
     * 지났는지 확인한다.
     */
    public boolean isVerificationExpired(
            LocalDateTime now
    ) {

        return verificationExpiresAt == null
                || !now.isBefore(
                verificationExpiresAt
        );
    }


    /*
     * 이 인증 완료 결과가
     * 이미 회원가입에 사용됐는지 확인한다.
     */
    public boolean isConsumed() {

        return consumedAt != null;
    }


    /*
     * 최종 회원가입에서 인증 완료 토큰을 사용한 뒤
     * 다시 재사용하지 못하도록 소비 처리한다.
     */
    public void consume(
            LocalDateTime now
    ) {

        this.consumedAt =
                now;
    }
}