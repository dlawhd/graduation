package shop.esjh.memoryjar.service.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import jakarta.validation.Validation;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import shop.esjh.memoryjar.config.properties.*;
import shop.esjh.memoryjar.dto.support.*;
import shop.esjh.memoryjar.entity.ai.*;
import shop.esjh.memoryjar.entity.support.*;
import shop.esjh.memoryjar.enums.ai.*;
import shop.esjh.memoryjar.enums.support.*;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.ai.*;
import shop.esjh.memoryjar.repository.support.*;
import shop.esjh.memoryjar.service.notification.NotificationService;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 동의, 운영 권한, 원문 비노출, 파일 실패와 접수 멱등성의 예외 경로를 외부 호출 없이 검증한다. */
@ExtendWith(MockitoExtension.class)
class SupportSafetyTest {
    @Mock SupportInquiryPersistenceService persistence;
    @Mock SupportInquiryRepository inquiries;
    @Mock SupportInquiryAuditRepository audits;
    @Mock JarDesignDraftRepository drafts;
    @Mock JarAiGenerationRepository generations;
    @Mock UserRepository users;
    @Mock SupportAuthorization authorization;
    @Mock NotificationService notifications;
    @Mock S3Client s3;
    @Mock S3Presigner presigner;
    S3Properties s3Properties = new S3Properties();

    SupportInquiryService service() {
        s3Properties.setBucket("fixture-private-bucket");
        return new SupportInquiryService(persistence, inquiries, s3, presigner, s3Properties);
    }
    SupportInquiryPersistenceService database() {
        return new SupportInquiryPersistenceService(inquiries, audits, drafts, generations, users, authorization, notifications);
    }
    SupportInquiry ticket(LocalDateTime time) {
        var draft = mock(JarDesignDraft.class);
        var generation = mock(JarAiGeneration.class);
        when(generation.getGenerationId()).thenReturn(50L);
        when(generation.getDraft()).thenReturn(draft);
        when(draft.getDraftId()).thenReturn(40L);
        when(draft.getOriginalS3Key()).thenReturn("private/original-secret.png");
        when(generation.getAiStyle()).thenReturn(JarAiStyle.CUTE_2D);
        when(generation.getErrorCode()).thenReturn(JarAiGenerationErrorCode.PROVIDER_REQUEST_FAILED);
        when(generation.getAiModel()).thenReturn("fixture-model");
        when(generation.getPromptVersion()).thenReturn("fixture-version");
        when(generation.getCompletedAt()).thenReturn(time);
        var ticket = SupportInquiry.reserve(1L, generation, "문의", "support-inquiries/private-secret.png", time);
        ReflectionTestUtils.setField(ticket, "inquiryId", 10L);
        return ticket;
    }
    @Test void requiredConsentAndTextLengthAreValidated() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (Boolean consent : Arrays.asList(null, false))
                assertThat(validator.validate(new SupportCreateRequest(40L, 50L, "문의", consent))).isNotEmpty();
            assertThat(validator.validate(new SupportCreateRequest(-1L, 50L, "문의", true))).isNotEmpty();
            assertThat(validator.validate(new SupportCreateRequest(40L, 50L, "  ", true))).isNotEmpty();
            assertThat(validator.validate(new SupportCreateRequest(40L, 50L, "가".repeat(1001), true))).isNotEmpty();
            assertThat(validator.validate(new SupportCreateRequest(40L, 50L, "가".repeat(1000), true))).isEmpty();
            assertThat(validator.validate(new SupportReplyRequest("가".repeat(3001)))).isNotEmpty();
        }
    }
    @Test void jarAdminAuthorityDoesNotGrantServiceOperator() {
        var properties = new SupportProperties();
        var auth = new SupportAuthorization(properties, users);
        var principal = new UsernamePasswordAuthenticationToken(Map.of("userId", 1L), "", List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        assertThat(SupportAuthorization.currentUserId(principal)).isEqualTo(1L);
        assertThat(auth.isOperator(1L)).isFalse();
        assertThatThrownBy(() -> auth.requireOperator(1L)).isInstanceOf(ResponseStatusException.class);
        properties.setOperatorUserIds(Set.of(2L));
        when(users.existsById(2L)).thenReturn(true);
        assertThat(auth.isOperator(2L)).isTrue();
        assertThat(auth.isOperator(1L)).isFalse();
    }
    @Test void disabledOperatorAccountIsDenied() {
        var props = new SupportProperties(); props.setOperatorUserIds(Set.of(2L));
        assertThat(new SupportAuthorization(props, users).isOperator(2L)).isFalse();
    }
    @Test void inquiryRecipientsUseOnlyConfiguredExistingOperatorsInOneQuery() {
        var props = new SupportProperties();
        var auth = new SupportAuthorization(props, users);
        assertThat(auth.operatorsToNotify()).isEmpty();
        verifyNoInteractions(users);
        props.setOperatorUserIds(Set.of(2L, 3L));
        var active = mock(shop.esjh.memoryjar.entity.User.class);
        when(users.findAllById(Set.of(2L, 3L))).thenReturn(List.of(active));
        assertThat(auth.operatorsToNotify()).containsExactly(active);
        verify(users, times(1)).findAllById(Set.of(2L, 3L));
        verify(users, never()).existsById(any());
    }
    @Test void anonymousAndMalformedPrincipalsAreDenied() {
        assertThatThrownBy(() -> SupportAuthorization.currentUserId(null)).isInstanceOf(ResponseStatusException.class);
        for (String value : List.of("not-a-number", "-1", "0")) {
            var auth = new UsernamePasswordAuthenticationToken(Map.of("userId", value), "", List.of());
            assertThatThrownBy(() -> SupportAuthorization.currentUserId(auth)).isInstanceOf(ResponseStatusException.class);
        }
    }
    @Test void missingConsentIsRejectedBeforeReadingOrCopying() {
        assertThatThrownBy(() -> database().reserve(1L, new SupportCreateRequest(40L, 50L, "문의", false))).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(users, drafts, generations, inquiries);
    }
    @Test void anotherUsersInquiryCannotBeReadOrPreviewed() {
        var t = ticket(SupportInquiryPersistenceService.now());
        when(inquiries.findById(10L)).thenReturn(Optional.of(t));
        assertThatThrownBy(() -> database().detail(99L, 10L, false)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> database().image(99L, 10L, false)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(audits, presigner);
    }
    @Test void operatorApisRejectBeforeReadingTickets() {
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN)).when(authorization).requireOperator(99L);
        var db = database();
        assertThatThrownBy(() -> db.detail(99L, 10L, true)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> db.image(99L, 10L, true)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> db.list(99L, null, null, true)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> db.review(99L, 10L)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> db.reply(99L, 10L, "답변")).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(inquiries, audits, notifications);
    }
    @Test void responseNeverContainsStorageKeysAndExpiredContentIsHidden() throws Exception {
        var now = SupportInquiryPersistenceService.now(); var t = ticket(now.minusDays(91));
        t.finishCopy(now.minusDays(90)); t.answer("민감한 답변", now.minusDays(89));
        var response = SupportInquiryResponse.from(t, false, now);
        var json = new ObjectMapper().findAndRegisterModules().writeValueAsString(response);
        assertThat(json).doesNotContain("secret", "민감한 답변", "fixture-model", "fixture-version", "sourceS3Key", "imageS3Key");
        assertThat(response.description()).isEmpty(); assertThat(response.imageAvailable()).isFalse();
        assertThat(response.contentExpired()).isTrue();
    }
    @Test void expiredOriginalCannotBeViewedEvenBeforeCleanupRuns() {
        var now = SupportInquiryPersistenceService.now(); var t = ticket(now.minusDays(31)); t.finishCopy(now.minusDays(30));
        when(inquiries.findById(10L)).thenReturn(Optional.of(t));
        assertThatThrownBy(() -> database().image(1L, 10L, false)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(audits, presigner);
    }
    @Test void operatorImageReadIsAudited() {
        var now = SupportInquiryPersistenceService.now(); var t = ticket(now); t.finishCopy(now);
        when(inquiries.findById(10L)).thenReturn(Optional.of(t));
        assertThat(database().image(2L, 10L, true).key()).isEqualTo(t.getImageS3Key());
        verify(authorization).requireOperator(2L); verify(audits).save(any());
    }
    @Test void photoUrlIsNotIssuedWhenExpiryIsLessThanOneSecondAway() {
        when(persistence.image(1L, 10L, false)).thenReturn(new SupportInquiryPersistenceService.ImageTarget(
                "private-key", SupportInquiryPersistenceService.now().plusNanos(500_000_000)));
        assertThatThrownBy(() -> service().preview(1L, 10L, false)).isInstanceOfSatisfying(
                ResponseStatusException.class, error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.GONE));
        verifyNoInteractions(presigner);
    }
    @Test void duplicateSubmittedInquiryDoesNotCopyAgain() {
        var request = new SupportCreateRequest(40L, 50L, "문의", true);
        when(persistence.reserve(1L, request)).thenReturn(new SupportInquiryPersistenceService.CopyTarget(10L, null, null, true));
        service().create(1L, request);
        verifyNoInteractions(s3); verify(persistence).detail(1L, 10L, false);
    }
    @Test void copyFailureDoesNotSubmitAndRetainsCleanupReservation() {
        var request = new SupportCreateRequest(40L, 50L, "문의", true);
        var target = new SupportInquiryPersistenceService.CopyTarget(10L, "private-secret", "private-target", false);
        when(persistence.reserve(1L, request)).thenReturn(target);
        when(s3.copyObject(any(CopyObjectRequest.class))).thenThrow(S3Exception.builder().message("secret-url token=private-value").statusCode(503).build());
        assertThatThrownBy(() -> service().create(1L, request)).isInstanceOf(ResponseStatusException.class)
                .hasMessageNotContaining("secret-url").hasMessageNotContaining("private-value");
        verify(persistence).failCopy(target); verify(persistence, never()).completeCopy(any(), any());
        verify(persistence, never()).detail(any(), any(), anyBoolean());
    }
    @Test void copyFailureLogDoesNotExposeExceptionOrImageKeys() {
        var request = new SupportCreateRequest(40L, 50L, "문의", true);
        var target = new SupportInquiryPersistenceService.CopyTarget(10L, "private-source", "private-target", false);
        when(persistence.reserve(1L, request)).thenReturn(target);
        when(s3.copyObject(any(CopyObjectRequest.class))).thenThrow(
                S3Exception.builder().message("token=private-secret private-source private-target").statusCode(503).build());
        var logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(SupportInquiryService.class);
        var captured = new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
        captured.start(); logger.addAppender(captured);
        try {
            assertThatThrownBy(() -> service().create(1L, request)).isInstanceOf(ResponseStatusException.class);
            assertThat(captured.list).hasSize(1);
            assertThat(captured.list.get(0).getFormattedMessage()).contains("inquiryId=10").doesNotContain("private", "token");
            assertThat(captured.list.get(0).getThrowableProxy()).isNull();
        } finally { logger.detachAppender(captured); captured.stop(); }
    }
    @Test void cleanupDeleteFailureIsRetriedWithoutDeletionMark() {
        when(inquiries.findImageCleanupIds(any(), any(), any())).thenReturn(List.of(10L));
        when(inquiries.findContentCleanupIds(any(), any())).thenReturn(List.of());
        when(persistence.prepareDelete(10L)).thenReturn(new SupportInquiryPersistenceService.ImageTarget("private-key", SupportInquiryPersistenceService.now()));
        when(s3.deleteObject(any(DeleteObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(503).build()).thenReturn(DeleteObjectResponse.builder().build());
        var service = service(); service.cleanup();
        verify(persistence, never()).deleted(any(), any());
        service.cleanup(); verify(persistence).deleted(10L, "private-key");
    }
    @Test void inProgressCopyIsNotDeletedAndStaleCopyBecomesRetryableOnlyAfterDeletion() {
        var now = SupportInquiryPersistenceService.now(); var t = ticket(now);
        when(inquiries.findForUpdate(10L)).thenReturn(Optional.of(t));
        assertThat(database().prepareDelete(10L)).isNull();
        ReflectionTestUtils.setField(t, "updatedAt", now.minusMinutes(11));
        assertThat(database().prepareDelete(10L)).isNotNull();
        assertThat(t.getStatus()).isEqualTo(SupportInquiryStatus.COPY_FAILED);
        assertThat(t.getImageDeletedAt()).isNull();
        database().deleted(10L, "wrong-key"); assertThat(t.getImageDeletedAt()).isNull();
        database().deleted(10L, t.getImageS3Key()); assertThat(t.getImageDeletedAt()).isNotNull();
    }
    @Test void alreadyAnsweredInquiryCannotSendAnotherNotification() {
        var now = SupportInquiryPersistenceService.now(); var t = ticket(now); t.finishCopy(now); t.answer("첫 답변", now);
        when(inquiries.findForUpdate(10L)).thenReturn(Optional.of(t));
        assertThatThrownBy(() -> database().reply(2L, 10L, "두 번째 답변")).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(notifications, audits);
    }
}
