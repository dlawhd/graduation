package shop.esjh.memoryjar.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/*
 * PasswordEncoderConfig 역할
 *
 * Memory Jar 자체 로그인에서 사용하는 비밀번호를
 * 안전한 Hash 값으로 바꿔주는 PasswordEncoder를 등록하는 설정 클래스야.
 *
 * 사용자가 회원가입할 때:
 *
 * Memory1234
 *
 * 라는 비밀번호를 입력했다고 해도 DB에는 절대로
 *
 * Memory1234
 *
 * 를 그대로 저장하지 않아.
 *
 * 대신:
 *
 * Memory1234
 *      ↓
 * PasswordEncoder
 *      ↓
 * $argon2id$v=19$m=19456,t=2,p=1$...
 *
 * 처럼 원래 비밀번호를 알아보기 어려운 Hash 값으로 변환해서 저장해.
 *
 *
 * 그리고 로그인할 때는 Hash를 다시 비밀번호로 되돌리는 것이 아니라:
 *
 * passwordEncoder.matches(
 *     사용자가 입력한 비밀번호,
 *     DB에 저장된 Hash
 * )
 *
 * 로 같은 비밀번호인지 확인한다.
 */
@Configuration
public class PasswordEncoderConfig {

    /*
     * Argon2 Hash에 사용할 Salt 길이야.
     *
     * Salt는 같은 비밀번호를 사용하더라도
     * 매번 서로 다른 Hash가 나오도록 도와주는 랜덤 값이야.
     */
    private static final int SALT_LENGTH = 16;

    /*
     * 최종 Hash의 길이야.
     *
     * 32 bytes = 256 bits
     */
    private static final int HASH_LENGTH = 32;

    /*
     * Argon2 계산을 동시에 몇 개의 작업으로 처리할지 나타낸다.
     *
     * 현재 서버 환경에서는 1로 시작한다.
     */
    private static final int PARALLELISM = 1;

    /*
     * 비밀번호 Hash 하나를 계산할 때 사용할 메모리 크기야.
     *
     * 19 MiB
     * =
     * 19 * 1024 KiB
     * =
     * 19456 KiB
     *
     * 일부러 계산 비용을 높여서
     * 공격자가 수많은 비밀번호를 빠르게 대입하기 어렵게 만든다.
     */
    private static final int MEMORY_KIB = 19 * 1024;

    /*
     * 같은 계산을 몇 번 반복할지 나타낸다.
     */
    private static final int ITERATIONS = 2;

    /*
     * PasswordEncoder를 Spring Bean으로 등록한다.
     *
     * 이제 Service에서:
     *
     * private final PasswordEncoder passwordEncoder;
     *
     * 형태로 주입받아 사용할 수 있다.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {

        /*
         * Argon2PasswordEncoder 생성자 순서:
         *
         * 1. saltLength
         * 2. hashLength
         * 3. parallelism
         * 4. memory
         * 5. iterations
         *
         * 즉 현재 설정은:
         *
         * Salt          = 16 bytes
         * Hash          = 32 bytes
         * Parallelism   = 1
         * Memory        = 19 MiB
         * Iterations    = 2
         *
         * 로 동작한다.
         */
        return new Argon2PasswordEncoder(
                SALT_LENGTH,
                HASH_LENGTH,
                PARALLELISM,
                MEMORY_KIB,
                ITERATIONS
        );
    }
}