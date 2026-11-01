package shop.esjh.memoryjar.service.ai;

import java.math.BigDecimal;
import java.time.LocalDateTime;
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
import shop.esjh.memoryjar.entity.ai.*;
import shop.esjh.memoryjar.enums.ai.JarDesignType;
import shop.esjh.memoryjar.repository.ai.*;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import shop.esjh.memoryjar.service.jar.JarService;
import static org.assertj.core.api.Assertions.*;

/** 커밋 응답을 모르는 요청이 실제 확정 트랜잭션을 기다리고 사용 중인 사진을 보존하는지 검증한다. */
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class, JarDesignFinalizePersistenceService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class FinalizationCopySafetyIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired JarDesignFinalizePersistenceService persistence;
    @Autowired JarDesignDraftRepository drafts;
    @Autowired JarDesignRepository designs;
    @Autowired JarRepository jars;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean JarService jarService;

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void compensationWaitsForCommitOrRollbackAndProtectsReferencedPhoto(boolean commit) throws Exception {
        Long[] ids = new TransactionTemplate(transactions).execute(tx -> {
            String unique = UUID.randomUUID().toString();
            var owner = saveUser(unique, unique + "@example.com", "시험");
            var jar = saveJar(owner, "최종화 시험", LocalDateTime.now().plusDays(1));
            var draft = JarDesignDraft.builder().owner(owner).originalS3Key("original.png")
                    .expiresAt(LocalDateTime.now().plusDays(1)).build();
            draft.selectOriginal();
            draft.updateSlot(new BigDecimal(".5"), new BigDecimal(".3"), new BigDecimal(".2"));
            drafts.saveAndFlush(draft);
            return new Long[]{owner.getId(), jar.getJarId(), draft.getDraftId()};
        });
        var written = new CountDownLatch(1); var release = new CountDownLatch(1);
        var checking = new CountDownLatch(1); var pool = Executors.newFixedThreadPool(2);
        try {
            var finalize = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                var draft = drafts.findByDraftIdForUpdate(ids[2]).orElseThrow();
                var jar = jars.findByJarId(ids[1]).orElseThrow();
                designs.saveAndFlush(JarDesign.builder().jar(jar).designType(JarDesignType.ORIGINAL)
                        .finalS3Key("final.png").slotCenterX(new BigDecimal(".5"))
                        .slotCenterY(new BigDecimal(".3")).slotSizeRatio(new BigDecimal(".2")).build());
                draft.markFinalized(jar); drafts.flush(); written.countDown();
                try { if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("시험 대기 초과"); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                if (!commit) tx.setRollbackOnly();
            }));
            if (!written.await(10, TimeUnit.SECONDS)) {
                // 작업 스레드가 DB 제약 등으로 실패했으면 대기 실패 대신 원래 원인을 드러낸다.
                finalize.get(1, TimeUnit.SECONDS);
                throw new AssertionError("확정 트랜잭션 준비 시간 초과");
            }
            var check = pool.submit(() -> { checking.countDown(); return persistence.mayDeleteFinalCopy(ids[0], ids[2], "final.png"); });
            assertThat(checking.await(10, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> check.get(150, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); finalize.get(15, TimeUnit.SECONDS);
            assertThat(check.get(15, TimeUnit.SECONDS)).isEqualTo(!commit);
            assertThat(persistence.mayDeleteFinalCopy(ids[0], ids[2], "loser.png")).isTrue();
            if (commit) {
                new TransactionTemplate(transactions).executeWithoutResult(tx -> jars.deleteById(ids[1]));
                assertThat(persistence.mayDeleteFinalCopy(ids[0], ids[2], "final.png")).isFalse();
            }
        } finally { release.countDown(); pool.shutdownNow(); }
    }
}
