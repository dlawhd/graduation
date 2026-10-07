package shop.esjh.memoryjar.service.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import shop.esjh.memoryjar.config.*;
import shop.esjh.memoryjar.config.properties.*;
import shop.esjh.memoryjar.dto.support.*;
import shop.esjh.memoryjar.entity.ai.*;
import shop.esjh.memoryjar.entity.support.*;
import shop.esjh.memoryjar.enums.ai.*;
import shop.esjh.memoryjar.enums.support.*;
import shop.esjh.memoryjar.repository.support.*;
import shop.esjh.memoryjar.repository.ai.*;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.service.notification.NotificationService;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** MariaDB 10.11에서 V49, 실제 잠금/중복 접수, 알림 원자성, 외부 I/O 트랜잭션 분리를 검증한다. */
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class, SupportConfig.class, SupportAuthorization.class, SupportInquiryPersistenceService.class,
        SupportInquiryService.class, NotificationService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class SupportInquiryIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired PlatformTransactionManager transactions;
    @Autowired SupportInquiryService service;
    @Autowired SupportInquiryPersistenceService persistence;
    @Autowired SupportInquiryRepository inquiries;
    @Autowired JarDesignDraftRepository drafts;
    @Autowired JarAiGenerationRepository generations;
    @Autowired UserRepository users;
    @Autowired SupportProperties operators;
    @MockitoBean S3Client s3;
    @MockitoBean S3Presigner presigner;
    @MockitoBean S3Properties storage;
    @MockitoBean SimpMessagingTemplate messages;

    @BeforeEach void resetOperatorConfiguration() {
        operators.setOperatorUserIds(Set.of());
    }

    /** 특정 문의의 운영자 알림 수만 확인하여 다른 테스트의 데이터와 섞이지 않게 한다. */
    int receivedNotificationCount(Long inquiryId) {
        var count = new TransactionTemplate(transactions).execute(tx -> entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM notifications WHERE type='SUPPORT_INQUIRY_RECEIVED' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.inquiryId'))=:id")
                .setParameter("id", String.valueOf(inquiryId)).getSingleResult());
        return ((Number) count).intValue();
    }

    record Fixture(Long owner, Long draft, Long generation) {
        SupportCreateRequest request() { return new SupportCreateRequest(draft, generation, "변환에 실패했어요.", true); }
    }
    Fixture fixture() {
        return new TransactionTemplate(transactions).execute(tx -> {
            var unique = UUID.randomUUID().toString(); var user = saveUser(unique, unique + "@example.test", "문의 사용자");
            var draft = JarDesignDraft.builder().owner(user).originalS3Key("fixture/" + unique + ".png")
                    .expiresAt(SupportInquiryPersistenceService.now().plusDays(1)).build();
            entityManager.persist(draft);
            var generation = failedGeneration(draft);
            return new Fixture(user.getId(), draft.getDraftId(), generation.getGenerationId());
        });
    }
    JarAiGeneration failedGeneration(JarDesignDraft draft) {
        var generation = JarAiGeneration.builder().draft(draft).aiStyle(JarAiStyle.CUTE_2D)
                .aiProvider(JarAiProvider.CLOUDFLARE).aiModel("fixture-model").promptVersion("fixture-version").build();
        entityManager.persist(generation);
        generation.markFailed(JarAiGenerationErrorCode.PROVIDER_REQUEST_FAILED, "안전한 오류 안내", SupportInquiryPersistenceService.now());
        return generation;
    }
    Long extraGeneration(Fixture f) {
        return new TransactionTemplate(transactions).execute(tx -> failedGeneration(entityManager.find(JarDesignDraft.class, f.draft)).getGenerationId());
    }

    @Test void simultaneousSubmissionCopiesOnlyOnceAndDoesNotHoldDatabaseTransactionDuringS3() throws Exception {
        var f = fixture(); when(storage.getBucket()).thenReturn("fixture-bucket");
        var operator = fixture(); operators.setOperatorUserIds(Set.of(operator.owner));
        var copying = new CountDownLatch(1); var release = new CountDownLatch(1);
        when(s3.copyObject(any(CopyObjectRequest.class))).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            copying.countDown(); assertThat(release.await(15, TimeUnit.SECONDS)).isTrue();
            return CopyObjectResponse.builder().build();
        });
        var executor = Executors.newSingleThreadExecutor();
        try {
            var first = executor.submit(() -> service.create(f.owner, f.request()));
            assertThat(copying.await(15, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> service.create(f.owner, f.request())).isInstanceOf(ResponseStatusException.class)
                    .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(409));
            release.countDown(); var receipt = first.get(20, TimeUnit.SECONDS);
            assertThat(service.create(f.owner, f.request()).inquiryId()).isEqualTo(receipt.inquiryId());
            assertThat(receipt.status()).isEqualTo(SupportInquiryStatus.OPEN);
            verify(s3, times(1)).copyObject(any(CopyObjectRequest.class));
            assertThat(receivedNotificationCount(receipt.inquiryId())).isEqualTo(1);
            verify(messages, times(1)).convertAndSend(eq("/topic/users/" + operator.owner + "/notifications"),
                    argThat((Object value) -> value instanceof shop.esjh.memoryjar.dto.notification.response.NotificationItemResponse response
                            && response.type() == shop.esjh.memoryjar.enums.notification.NotificationType.SUPPORT_INQUIRY_RECEIVED
                            && response.inquiryId().equals(receipt.inquiryId())));
        } finally { release.countDown(); executor.shutdownNow(); }
    }

    @Test void completedInquiryNotifiesOnlyExistingActiveOperatorsIncludingOperatorOwner() {
        var f = fixture(); var other = fixture(); var deleted = fixture(); var ordinary = fixture();
        users.deleteById(deleted.owner);
        operators.setOperatorUserIds(Set.of(f.owner, other.owner, deleted.owner, Long.MAX_VALUE));
        var target = persistence.reserve(f.owner, f.request());
        assertThat(receivedNotificationCount(target.inquiryId())).isZero();
        persistence.completeCopy(f.owner, target);
        assertThat(receivedNotificationCount(target.inquiryId())).isEqualTo(2);
        verify(messages).convertAndSend(eq("/topic/users/" + f.owner + "/notifications"), any(Object.class));
        verify(messages).convertAndSend(eq("/topic/users/" + other.owner + "/notifications"), any(Object.class));
        verify(messages, never()).convertAndSend(eq("/topic/users/" + deleted.owner + "/notifications"), any(Object.class));
        verify(messages, never()).convertAndSend(eq("/topic/users/" + ordinary.owner + "/notifications"), any(Object.class));
    }

    @Test void copyFailureDoesNotNotifyOperators() {
        var f = fixture(); var operator = fixture(); operators.setOperatorUserIds(Set.of(operator.owner));
        when(storage.getBucket()).thenReturn("fixture-bucket");
        when(s3.copyObject(any(CopyObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(503).build());
        assertThatThrownBy(() -> service.create(f.owner, f.request())).isInstanceOf(ResponseStatusException.class);
        var ticket = inquiries.findByGenerationId(f.generation).orElseThrow();
        assertThat(ticket.getStatus()).isEqualTo(SupportInquiryStatus.COPY_FAILED);
        assertThat(receivedNotificationCount(ticket.getInquiryId())).isZero();
        verifyNoInteractions(messages);
    }

    @Test void rolledBackCompletionDoesNotLeaveOrSendOperatorNotification() {
        var f = fixture(); var operator = fixture(); operators.setOperatorUserIds(Set.of(operator.owner));
        var target = persistence.reserve(f.owner, f.request());
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            persistence.completeCopy(f.owner, target);
            assertThat(receivedNotificationCount(target.inquiryId())).isEqualTo(1);
            verifyNoInteractions(messages);
            tx.setRollbackOnly();
        });
        assertThat(receivedNotificationCount(target.inquiryId())).isZero();
        assertThat(inquiries.findById(target.inquiryId()).orElseThrow().getStatus()).isEqualTo(SupportInquiryStatus.COPYING);
        verifyNoInteractions(messages);
    }

    @Test void inquiryCanCompleteWithoutConfiguredOperators() {
        var f = fixture(); var target = persistence.reserve(f.owner, f.request());
        persistence.completeCopy(f.owner, target);
        assertThat(receivedNotificationCount(target.inquiryId())).isZero();
        assertThat(persistence.detail(f.owner, target.inquiryId(), false).status()).isEqualTo(SupportInquiryStatus.OPEN);
        verifyNoInteractions(messages);
    }

    @Test void hourlyLimitIsSerializedAcrossDifferentCandidates() throws Exception {
        var f = fixture();
        for (int n = 0; n < 9; n++) persistence.reserve(f.owner, new SupportCreateRequest(f.draft, extraGeneration(f), "문의", true));
        Long a = extraGeneration(f), b = extraGeneration(f);
        var executor = Executors.newFixedThreadPool(2); var start = new CountDownLatch(1);
        try {
            java.util.function.Function<Long, Boolean> request = id -> {
                try { persistence.reserve(f.owner, new SupportCreateRequest(f.draft, id, "문의", true)); return true; }
                catch (ResponseStatusException e) { assertThat(e.getStatusCode().value()).isEqualTo(429); return false; }
            };
            var first = executor.submit(() -> { start.await(); return request.apply(a); });
            var second = executor.submit(() -> { start.await(); return request.apply(b); });
            start.countDown(); assertThat(first.get(20, TimeUnit.SECONDS)).isNotEqualTo(second.get(20, TimeUnit.SECONDS));
            assertThat(inquiries.countByOwnerIdAndSharingAgreedAtAfter(f.owner, SupportInquiryPersistenceService.now().minusHours(1))).isEqualTo(10);
        } finally { executor.shutdownNow(); }
    }

    @Test void oneReplyOneNotificationAndLegacyNotificationFieldsRemainCompatible() throws Exception {
        var f = fixture(); var target = persistence.reserve(f.owner, f.request()); persistence.completeCopy(f.owner, target);
        operators.setOperatorUserIds(Set.of(f.owner));
        var executor = Executors.newFixedThreadPool(2); var start = new CountDownLatch(1);
        try {
            Callable<Boolean> reply = () -> {
                start.await();
                try { persistence.reply(f.owner, target.inquiryId(), "제공자 응답을 확인했습니다."); return true; }
                catch (ResponseStatusException e) { assertThat(e.getStatusCode().value()).isEqualTo(409); return false; }
            };
            var a = executor.submit(reply); var b = executor.submit(reply); start.countDown();
            assertThat(a.get(20, TimeUnit.SECONDS)).isNotEqualTo(b.get(20, TimeUnit.SECONDS));
            var result = new TransactionTemplate(transactions).execute(tx -> entityManager.createNativeQuery(
                    "SELECT COUNT(*) FROM notifications WHERE user_id = :owner AND type = 'SUPPORT_REPLIED'")
                    .setParameter("owner", f.owner).getSingleResult());
            assertThat(((Number) result).intValue()).isEqualTo(1);
            assertThat(persistence.detail(f.owner, target.inquiryId(), false).reply()).isEqualTo("제공자 응답을 확인했습니다.");
            verify(messages).convertAndSend(eq("/topic/users/" + f.owner + "/notifications"), argThat((Object payload) ->
                    payload instanceof shop.esjh.memoryjar.dto.notification.response.NotificationItemResponse response
                            && response.inquiryId().equals(target.inquiryId()) && response.jarId() == null));
        } finally { executor.shutdownNow(); }
    }

    @Test void inquirySurvivesDraftExpiryButItsPhotoAndTextHaveIndependentRetention() {
        var f = fixture(); when(storage.getBucket()).thenReturn("fixture-bucket");
        var target = persistence.reserve(f.owner, f.request()); persistence.completeCopy(f.owner, target);
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var draft = drafts.findById(f.draft).orElseThrow(); draft.markExpired();
            var ticket = inquiries.findById(target.inquiryId()).orElseThrow();
            ReflectionTestUtils.setField(ticket, "imageExpiresAt", SupportInquiryPersistenceService.now().minusDays(1));
            ReflectionTestUtils.setField(ticket, "contentExpiresAt", SupportInquiryPersistenceService.now().minusDays(1));
        });
        assertThat(persistence.detail(f.owner, target.inquiryId(), false).contentExpired()).isTrue();
        service.cleanup();
        verify(s3).deleteObject(argThat((DeleteObjectRequest request) -> request.key().equals(target.imageKey())));
        var ticket = inquiries.findById(target.inquiryId()).orElseThrow();
        assertThat(ticket.getImageDeletedAt()).isNotNull(); assertThat(ticket.getContentDeletedAt()).isNotNull();
        assertThat(ticket.getDescription()).isEmpty();
    }

    @Test void wrongOwnerAndSuccessfulCandidateCannotCreateInquiry() {
        var f = fixture(); var stranger = fixture();
        assertThatThrownBy(() -> persistence.reserve(stranger.owner, f.request())).isInstanceOf(ResponseStatusException.class);
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var g = generations.findById(f.generation).orElseThrow();
            ReflectionTestUtils.setField(g, "status", JarAiGenerationStatus.SUCCEEDED);
            ReflectionTestUtils.setField(g, "generatedS3Key", "fixture/candidate.png");
            ReflectionTestUtils.setField(g, "errorCode", null); ReflectionTestUtils.setField(g, "errorMessage", null);
        });
        assertThatThrownBy(() -> persistence.reserve(f.owner, f.request())).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(s3);
    }
}
