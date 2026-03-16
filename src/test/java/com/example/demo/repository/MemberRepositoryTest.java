package com.example.demo.repository;

import com.example.demo.config.JpaAuditConfig;
import com.example.demo.entity.Member;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest // Repository/JPA만 테스트
@Testcontainers // 테스트할 때 도커로 MariaDB를 띄움
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE) // H2로 바꾸지 말고 내가 지정한 DB 그대로 사용
@Import(JpaAuditConfig.class) // createdAt, updatedAt 같은 감사(Auditing) 기능 켜기
class MemberRepositoryTest {

    @Container
    static MariaDBContainer<?> mariaDBContainer =
            new MariaDBContainer<>("mariadb:10.11")
                    .withDatabaseName("testdb")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mariaDBContainer::getJdbcUrl);
        registry.add("spring.datasource.username", mariaDBContainer::getUsername);
        registry.add("spring.datasource.password", mariaDBContainer::getPassword);
        registry.add("spring.datasource.driver-class-name", mariaDBContainer::getDriverClassName);
    }

    @Autowired
    private MemberRepository memberRepository;

    @Test
    @DisplayName("provider + providerId로 회원을 찾을 수 있다")
    void findByProviderAndProviderId_회원이_있으면_반환한다() {
        // given
        Member member = saveMember("naver-123", "user@example.com", "은서", "2000");

        // when
        Optional<Member> result =
                memberRepository.findByProviderAndProviderId("NAVER", "naver-123");

        // then
        assertThat(result).isPresent();
        assertThat(result.get().getProvider()).isEqualTo("NAVER");
        assertThat(result.get().getProviderId()).isEqualTo("naver-123");
        assertThat(result.get().getEmail()).isEqualTo("user@example.com");
        assertThat(result.get().getName()).isEqualTo("은서");
        assertThat(result.get().getBirthyear()).isEqualTo("2000");
    }

    @Test
    @DisplayName("provider + providerId가 다르면 empty를 반환한다")
    void findByProviderAndProviderId_회원이_없으면_empty를_반환한다() {
        // given
        saveMember("naver-123", "user@example.com", "은서", "2000");

        // when
        Optional<Member> result =
                memberRepository.findByProviderAndProviderId("NAVER", "naver-999");

        // then
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("email로 회원을 찾을 수 있다")
    void findByEmail_회원이_있으면_반환한다() {
        // given
        saveMember("naver-456", "hello@example.com", "종현", "1999");

        // when
        Optional<Member> result = memberRepository.findByEmail("hello@example.com");

        // then
        assertThat(result).isPresent();
        assertThat(result.get().getProvider()).isEqualTo("NAVER");
        assertThat(result.get().getProviderId()).isEqualTo("naver-456");
        assertThat(result.get().getEmail()).isEqualTo("hello@example.com");
        assertThat(result.get().getName()).isEqualTo("종현");
        assertThat(result.get().getBirthyear()).isEqualTo("1999");
    }

    @Test
    @DisplayName("email이 다르면 empty를 반환한다")
    void findByEmail_회원이_없으면_empty를_반환한다() {
        // given
        saveMember("naver-456", "hello@example.com", "종현", "1999");

        // when
        Optional<Member> result = memberRepository.findByEmail("notfound@example.com");

        // then
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("회원 저장 시 createdAt, updatedAt이 자동으로 들어간다")
    void save_회원저장시_createdAt_updatedAt이_자동으로_저장된다() {
        // given
        Member member = Member.builder()
                .provider("NAVER")
                .providerId("naver-audit")
                .email("audit@example.com")
                .name("감사테스트")
                .birthyear("2001")
                .build();

        // when
        Member savedMember = memberRepository.saveAndFlush(member);

        // then
        assertThat(savedMember.getCreatedAt()).isNotNull();
        assertThat(savedMember.getUpdatedAt()).isNotNull();
        assertThat(savedMember.getDeletedAt()).isNull();
    }

    private Member saveMember(String providerId, String email, String name, String birthyear) {
        Member member = Member.builder()
                .provider("NAVER")
                .providerId(providerId)
                .email(email)
                .name(name)
                .birthyear(birthyear)
                .build();

        return memberRepository.saveAndFlush(member);
    }
}