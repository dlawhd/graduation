package shop.esjh.memoryjar.service;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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

    /** 먼저 읽은 프로필이 나중에 저장되어도 비밀번호 재설정의 로그인 무효화 번호는 감소하지 않는다. */
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void staleProfileSaveCannotUndoSessionRevocation(boolean oauthProfile) throws Exception {
        Fixture data = fixture();
        String oldRefresh = refresh.issue(data.user);
        var executor = Executors.newSingleThreadExecutor();
        try {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                User staleUser = users.findById(data.user.getId()).orElseThrow();
                assertThat(staleUser.getSessionVersion()).isZero();
                try {
                    // 다른 DB 연결이 먼저 폐기를 확정하게 해 문제의 저장 순서를 항상 재현한다.
                    executor.submit(() -> refresh.revokeAllForUser(data.user.getId())).get(15, TimeUnit.SECONDS);
                } catch (Exception failure) {
                    throw new IllegalStateException(failure);
                }
                if (oauthProfile) staleUser.updateProfile(UUID.randomUUID() + "@example.com", null, "2001");
                else staleUser.changeNickname("변경닉네임");
                users.saveAndFlush(staleUser);
            });
            User saved = users.findById(data.user.getId()).orElseThrow();
            assertThat(saved.getSessionVersion()).isEqualTo(1L);
            if (oauthProfile) assertThat(saved.getBirthyear()).isEqualTo("2001");
            else assertThat(saved.getName()).isEqualTo("변경닉네임");
            var validity = new shop.esjh.memoryjar.jwt.SessionValidityService(users);
            assertThat(validity.isCurrent(saved.getId(), 0L)).isFalse();
            assertThat(validity.isCurrent(saved.getId(), 1L)).isTrue();
            assertThatThrownBy(() -> refresh.rotate(oldRefresh)).isInstanceOf(IllegalArgumentException.class);
        } finally { executor.shutdownNow(); }
    }


    /** 회전이 먼저 끝나거나 로그아웃이 먼저 끝나도 같은 기기만 폐기돼야 한다. */
    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void logoutAndRotationCannotReviveSameDevice(boolean rotateFirst) throws Exception {
        Fixture f = fixture();
        String raw = refresh.issue(f.user);
        String other = refresh.issue(f.user);
        String sessionId = shop.esjh.memoryjar.auth.TokenCrypto.sha256Hex(raw);
        var firstDone = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var secondStarted = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var rotation = rotateFirst ? refresh.rotate(raw) : null;
                if (!rotateFirst) refresh.revokeIfPresent(raw);
                firstDone.countDown();
                try { if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("대기 초과"); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                return rotation;
            }));
            assertThat(firstDone.await(10, TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(() -> {
                secondStarted.countDown();
                if (rotateFirst) { refresh.revokeIfPresent(raw); return 200; }
                try { refresh.rotate(raw); return 200; } catch (IllegalArgumentException revoked) { return 401; }
            });
            assertThat(secondStarted.await(10, TimeUnit.SECONDS)).isTrue();
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> second.get(150, TimeUnit.MILLISECONDS))
                    .isInstanceOf(java.util.concurrent.TimeoutException.class);
            release.countDown();
            var rotation = first.get(15, TimeUnit.SECONDS);
            assertThat(second.get(15, TimeUnit.SECONDS)).isEqualTo(rotateFirst ? 200 : 401);
            if (rotation != null) {
                assertThat(rotation.sessionId()).isEqualTo(sessionId);
                assertThatThrownBy(() -> refresh.rotate(rotation.newRefreshRaw())).isInstanceOf(IllegalArgumentException.class);
            }
            var validity = new shop.esjh.memoryjar.jwt.SessionValidityService(users);
            assertThat(validity.isCurrent(f.user.getId(), 0L, sessionId)).isFalse();
            assertThat(validity.isCurrent(f.user.getId(), 0L, refresh.rotate(other).sessionId())).isTrue();
        } finally { release.countDown(); executor.shutdownNow(); }
    }

    @TestConfiguration
    // 아래 설정은 실제 외부 서비스 대신 테스트용 토큰 만료 값만 제공한다.
    static class Settings {
        @Bean JwtProperties jwtProperties() {
            var value = new JwtProperties();
            value.setRefreshExpSeconds(3600);
            return value;
        }
    }
}
