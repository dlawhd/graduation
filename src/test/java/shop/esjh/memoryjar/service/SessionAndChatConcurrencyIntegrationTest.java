package shop.esjh.memoryjar.service;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.config.properties.JwtProperties;
import shop.esjh.memoryjar.dto.chat.request.ChatMessageSendRequest;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.enums.jar.JarRole;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.RefreshTokenRepository;
import shop.esjh.memoryjar.repository.chat.ChatMessageRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import shop.esjh.memoryjar.service.chat.ChatService;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 실제 MariaDB 행 잠금으로 동시 채팅 재전송 및 비밀번호 재설정과 토큰 회전 경쟁을 검증한다. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class, ChatService.class, RefreshTokenService.class, SessionAndChatConcurrencyIntegrationTest.Settings.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class SessionAndChatConcurrencyIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired private ChatService chat;
    @Autowired private RefreshTokenService refresh;
    @Autowired private UserRepository users;
    @Autowired private RefreshTokenRepository tokens;
    @Autowired private ChatMessageRepository messages;
    @Autowired private PlatformTransactionManager transactions;

    private record Fixture(User user, Long jarId) {}

    private Fixture fixture() {
        return new TransactionTemplate(transactions).execute(status -> {
            String unique = UUID.randomUUID().toString();
            User user = saveUser(unique, unique + "@example.com", "시험");
            var jar = saveJar(user, "동시성 시험", LocalDateTime.now().plusDays(1));
            saveJarMember(jar, user, JarRole.OWNER, LocalDateTime.now());
            return new Fixture(user, jar.getJarId());
        });
    }

    @Test
    void concurrentRetriesPersistExactlyOneMessage() throws Exception {
        Fixture data = fixture();
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var request = new ChatMessageSendRequest("입구 위치 시험", "same-request");
            var first = executor.submit(() -> { start.await(); return chat.sendTextMessage(data.user.getId(), data.jarId, request); });
            var second = executor.submit(() -> { start.await(); return chat.sendTextMessage(data.user.getId(), data.jarId, request); });
            start.countDown();
            assertThat(first.get(15, TimeUnit.SECONDS).messageId()).isEqualTo(second.get(15, TimeUnit.SECONDS).messageId());
            var persisted = new TransactionTemplate(transactions).execute(status ->
                    messages.findByJar_JarIdAndSender_IdAndClientRequestId(data.jarId, data.user.getId(), "same-request"));
            assertThat(persisted).isPresent();
        } finally { executor.shutdownNow(); }
    }

    @Test
    void resetAndRotationCannotLeaveActiveOldSession() throws Exception {
        Fixture data = fixture();
        String raw = refresh.issue(data.user);
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var rotate = executor.submit(() -> {
                start.await();
                try { return refresh.rotate(raw); } catch (IllegalArgumentException revoked) { return null; }
            });
            var reset = executor.submit(() -> { start.await(); return refresh.revokeAllForUser(data.user.getId()); });
            start.countDown();
            reset.get(15, TimeUnit.SECONDS);
            var rotation = rotate.get(15, TimeUnit.SECONDS);
            assertThat(users.findSessionVersionById(data.user.getId())).contains(1L);
            assertThatThrownBy(() -> refresh.rotate(raw)).isInstanceOf(IllegalArgumentException.class);
            if (rotation != null) {
                assertThat(rotation.sessionVersion()).isZero();
                assertThatThrownBy(() -> refresh.rotate(rotation.newRefreshRaw())).isInstanceOf(IllegalArgumentException.class);
            }
            assertThatThrownBy(() -> refresh.issue(data.user)).isInstanceOf(IllegalArgumentException.class);
            User newLogin = users.findById(data.user.getId()).orElseThrow();
            assertThat(refresh.rotate(refresh.issue(newLogin)).sessionVersion()).isEqualTo(1L);
        } finally { executor.shutdownNow(); }
    }

    @Test
    void staleLoginTransactionCannotIssueRefreshAfterReset() throws Exception {
        Fixture data = fixture();
        var executor = Executors.newSingleThreadExecutor();
        try {
            assertThatThrownBy(() -> new TransactionTemplate(transactions).execute(status -> {
                User oldSnapshot = users.findById(data.user.getId()).orElseThrow();
                assertThat(oldSnapshot.getSessionVersion()).isZero();
                try {
                    // 먼저 시작한 로그인 조회의 REPEATABLE READ 스냅샷을 남겨 두고 다른 요청이 폐기한다.
                    executor.submit(() -> refresh.revokeAllForUser(data.user.getId())).get(15, TimeUnit.SECONDS);
                } catch (Exception failure) {
                    throw new IllegalStateException(failure);
                }
                return refresh.issue(oldSnapshot);
            })).isInstanceOf(IllegalArgumentException.class);
            assertThat(users.findSessionVersionById(data.user.getId())).contains(1L);
        } finally { executor.shutdownNow(); }
    }

    @TestConfiguration
    static class Settings {
        @Bean JwtProperties jwtProperties() {
            var value = new JwtProperties();
            value.setRefreshExpSeconds(3600);
            return value;
        }
    }
}
