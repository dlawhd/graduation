package shop.esjh.memoryjar.service.ai;

import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;

/** 원본 정리가 진행 중인 생성의 DB 결과를 기다리고, 커밋된 원본 참조를 보호하는지 검사한다. */
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class, JarDesignDraftPersistenceService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class DraftOriginalSafetyIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired JarDesignDraftPersistenceService persistence;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean AiDraftProperties properties;

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void cleanupWaitsForCreationOutcomeBeforeDeletingOriginal(boolean commit) throws Exception {
        when(properties.getExpiresAfterDays()).thenReturn(7);
        String key = "originals/" + UUID.randomUUID() + ".png";
        Long userId = new TransactionTemplate(transactions).execute(tx -> {
            String id = UUID.randomUUID().toString();
            return saveUser(id, id + "@example.com", "시험").getId();
        });
        var stored = new CountDownLatch(1); var release = new CountDownLatch(1);
        var checking = new CountDownLatch(1); var pool = Executors.newFixedThreadPool(2);
        try {
            var creation = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                persistence.createDraft(userId, key, null); entityManager.flush(); stored.countDown();
                try { if (!release.await(20, TimeUnit.SECONDS)) throw new IllegalStateException("시험 대기 초과"); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                if (!commit) tx.setRollbackOnly();
            }));
            if (!stored.await(15, TimeUnit.SECONDS)) { creation.get(1, TimeUnit.SECONDS); fail("저장 준비 시간 초과"); }
            var cleanup = pool.submit(() -> { checking.countDown(); return persistence.mayDeleteOriginal(userId, key); });
            assertThat(checking.await(10, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> cleanup.get(200, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); creation.get(20, TimeUnit.SECONDS);
            assertThat(cleanup.get(20, TimeUnit.SECONDS)).isEqualTo(!commit);
            // 다른 요청의 원본과 혼동하지 않고 참조가 없는 고유 키만 정리 가능해야 한다.
            assertThat(persistence.mayDeleteOriginal(userId, key + ".unused")).isTrue();
            assertThat(persistence.mayDeleteOriginal(Long.MAX_VALUE, key)).isFalse();
        } finally { release.countDown(); pool.shutdownNow(); }
    }
}
