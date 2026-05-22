package shop.esjh.memoryjar.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

// 스프링은 기본적으로 “메인 클래스 패키지 이하”를 자동으로 스캔해서 설정을 적용해줌..
/*
 * JPA Auditing 시간이 항상 한국 시간(Asia/Seoul)으로 찍히게 만드는 설정이야.
 * createdAt, updatedAt 같은 자동 시간 필드가 서버 기본 시간대에 흔들리지 않게 해줘.
 */
@Configuration
@EnableJpaAuditing(dateTimeProviderRef = "kstDateTimeProvider")
public class JpaAuditConfig {

    // 한국 시간대 고정
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    /*
     * JPA가 createdAt, updatedAt을 채울 때 지금 시간을 뭐로 볼까?를 알려주는 부분
     */
    @Bean
    public DateTimeProvider kstDateTimeProvider() {
        return () -> Optional.of(LocalDateTime.now(KST));
    }
}