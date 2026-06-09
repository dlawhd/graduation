package shop.esjh.memoryjar;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * MemoryJarApplication이 테스트 환경에서 정상적으로 로딩되는지 확인하는 테스트입니다.
 *
 * 이 테스트의 목적은 DB migration 검증이 아니라
 * Spring Context가 기본적으로 뜨는지 확인하는 것입니다.
 *
 * 그래서 Flyway와 JPA schema 검증은 끄고,
 * 실제 migration 검증은 Repository 테스트에서 MariaDB Testcontainers로 확인합니다.
 */
@ActiveProfiles("test")
@SpringBootTest(properties = {
		"spring.flyway.enabled=false",
		"spring.jpa.hibernate.ddl-auto=none"
})
class DemoApplicationTests {

	@Test
	void contextLoads() {
	}
}