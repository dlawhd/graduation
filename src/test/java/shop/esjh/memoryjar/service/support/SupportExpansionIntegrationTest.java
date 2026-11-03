package shop.esjh.memoryjar.service.support;

import java.util.*;
import java.util.concurrent.*;
import java.time.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import shop.esjh.memoryjar.config.*;
import shop.esjh.memoryjar.config.properties.*;
import shop.esjh.memoryjar.repository.support.*;
import shop.esjh.memoryjar.repository.ai.*;
import shop.esjh.memoryjar.entity.ai.*;
import shop.esjh.memoryjar.entity.support.*;
import shop.esjh.memoryjar.enums.support.*;
import shop.esjh.memoryjar.enums.ai.*;
import shop.esjh.memoryjar.enums.jar.*;
import shop.esjh.memoryjar.dto.support.*;
import shop.esjh.memoryjar.service.notification.NotificationService;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 임시 MariaDB에서 일반/기존 문의·대화 경쟁·게스트 격리·첨부 실패를 검증한다. 외부 저장과 알림 전송은 대역이다. */
@DataJpaTest(showSql=false,properties={"spring.jpa.properties.hibernate.generate_statistics=true","spring.jpa.properties.hibernate.session.events.log=false"})
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class,SupportConfig.class,SupportAuthorization.class,SupportAccessCrypto.class,SupportRateGuard.class,
        SupportInquiryAccess.class,SupportConversationService.class,SupportGuestService.class,SupportInquiryPersistenceService.class,
        SupportAttachmentPersistenceService.class,SupportScreenshotValidator.class,SupportAttachmentService.class,NotificationService.class})
@Transactional(propagation=Propagation.NOT_SUPPORTED)
class SupportExpansionIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired PlatformTransactionManager transactions;
    @Autowired SupportConversationService conversations;
    @Autowired SupportInquiryPersistenceService legacy;
    @Autowired SupportGuestService guests;
    @Autowired SupportAttachmentPersistenceService attachmentState;
    @Autowired SupportAttachmentService uploads;
    @Autowired SupportInquiryRepository inquiries;
    @Autowired SupportMessageRepository messages;
    @Autowired SupportAttachmentRepository attachments;
    @Autowired SupportGuestSessionRepository sessions;
    @Autowired SupportProperties operators;
    @Autowired SupportRateGuard rates;
    @Autowired JarDesignDraftRepository drafts;
    @Autowired JarAiGenerationRepository generations;
    @Autowired jakarta.persistence.EntityManagerFactory emf;
    @MockitoBean S3Client s3;
    @MockitoBean S3Presigner presigner;
    @MockitoBean S3Properties storage;
    @MockitoBean SimpMessagingTemplate broker;

    @BeforeEach void configure() { operators.setOperatorUserIds(Set.of());when(storage.getBucket()).thenReturn("support-fixture-private"); }
    SupportActor user() {
        Long id=new TransactionTemplate(transactions).execute(tx->{String unique=UUID.randomUUID().toString();return saveUser(unique,unique+"@example.com","시험 사용자").getId();});
        return SupportActor.user(id);
    }
    SupportGeneralCreateRequest request(SupportCategory category,String requestId) {
        return new SupportGeneralCreateRequest(category,"문의 제목","문의 내용",requestId,null,null,null,null,null);
    }
    SupportInquiryResponse create(SupportActor user) { return conversations.create(user,request(SupportCategory.OTHER,UUID.randomUUID().toString())); }
    SupportActor operator() { var user=user();operators.setOperatorUserIds(Set.of(user.userId()));return SupportActor.operator(user.userId()); }
    void status(int code,org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOf(ResponseStatusException.class).satisfies(e->assertThat(((ResponseStatusException)e).getStatusCode().value()).isEqualTo(code));
    }
    <T> List<T> simultaneous(Callable<T> action) throws Exception {
        var start=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        try {Callable<T> wrapped=()->{if(!start.await(10,TimeUnit.SECONDS))throw new AssertionError("준비 시간 초과");return action.call();};
            var a=pool.submit(wrapped);var b=pool.submit(wrapped);start.countDown();return List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS));
        } finally {start.countDown();pool.shutdownNow();}
    }

    @ParameterizedTest @EnumSource(SupportCategory.class)
    void generalNeedsNoPhotoDraftOrGeneration(SupportCategory category) {
        var actor=user();var result=conversations.create(actor,request(category,UUID.randomUUID().toString()));
        assertThat(result.generationId()).isNull();assertThat(result.imageAvailable()).isFalse();assertThat(result.category()).isEqualTo(category);
        assertThat(result.title()).isEqualTo("문의 제목");assertThat(result.status()).isEqualTo(SupportInquiryStatus.OPEN);
        assertThat(conversations.view(actor,result.inquiryId()).messages().items()).isEmpty();verifyNoInteractions(s3);
    }
    @Test void duplicateGeneralCreatesOneRowAndOneNotification() throws Exception {
        var actor=user();var op=operator();var request=request(SupportCategory.OTHER,UUID.randomUUID().toString());
        var results=simultaneous(()->conversations.create(actor,request).inquiryId());assertThat(results.get(0)).isEqualTo(results.get(1));
        assertThat(inquiries.countByOwnerIdAndSharingAgreedAtAfter(actor.userId(),SupportInquiryPersistenceService.now().minusHours(1))).isEqualTo(1);
        verify(broker,times(1)).convertAndSend(eq("/topic/users/"+op.userId()+"/notifications"),any(Object.class));
        status(409,()->conversations.create(actor,new SupportGeneralCreateRequest(SupportCategory.OTHER,"바뀐 제목","문의 내용",request.requestId(),null,null,null,null,null)));
    }
    @Test void concurrentTenthAndEleventhGeneralRequestCannotBypassLimit() throws Exception {
        var actor=user();for(int n=0;n<9;n++)create(actor);
        var results=simultaneous(()->{try{create(actor);return 200;}catch(ResponseStatusException e){return e.getStatusCode().value();}});
        assertThat(results).containsExactlyInAnyOrder(200,429);
    }
    @Test void oldAiAndGeneralCreationShareTheSameHourlyLimitLock() throws Exception {
        var owner=user();for(int n=0;n<9;n++)create(owner);
        long[] fixture=new TransactionTemplate(transactions).execute(tx->{
            var draft=JarDesignDraft.builder().owner(entityManager.getReference(shop.esjh.memoryjar.entity.User.class,owner.userId()))
                    .originalS3Key("fixture/support.png").expiresAt(SupportInquiryPersistenceService.now().plusDays(1)).build();entityManager.persist(draft);
            var generation=JarAiGeneration.builder().draft(draft).aiStyle(JarAiStyle.CUTE_2D).aiProvider(JarAiProvider.CLOUDFLARE).aiModel("fixture").promptVersion("fixture").build();entityManager.persist(generation);
            generation.markFailed(JarAiGenerationErrorCode.PROVIDER_REQUEST_FAILED,"안전한 시험 오류",SupportInquiryPersistenceService.now());
            entityManager.flush();return new long[]{draft.getDraftId(),generation.getGenerationId()};
        });
        var sequence=new java.util.concurrent.atomic.AtomicInteger();
        var results=simultaneous(()->{
            try {if(sequence.getAndIncrement()==0)legacy.reserve(owner.userId(),new SupportCreateRequest(fixture[0],fixture[1],"기존 AI 접수",true));else create(owner);return 200;}
            catch(ResponseStatusException e){return e.getStatusCode().value();}
        });
        assertThat(results).containsExactlyInAnyOrder(200,429);
    }
    @Test void contextCannotReferenceAnotherUsersJarOrDraftAndQueryIsNotStored() {
        var actor=user();var other=user();
        Long[] ids=new TransactionTemplate(transactions).execute(tx->{var owner=entityManager.find(shop.esjh.memoryjar.entity.User.class,other.userId());
            var jar=saveJar(owner,"다른 계정",LocalDateTime.now().plusDays(1));
            var draft=drafts.saveAndFlush(JarDesignDraft.builder().owner(owner).originalS3Key("fixture/private").expiresAt(LocalDateTime.now().plusDays(1)).build());
            return new Long[]{jar.getJarId(),draft.getDraftId()};});
        status(404,()->conversations.create(actor,new SupportGeneralCreateRequest(SupportCategory.THREE_D,"제목","내용",UUID.randomUUID().toString(),ids[0],null,null,null,null)));
        status(404,()->conversations.create(actor,new SupportGeneralCreateRequest(SupportCategory.OTHER,"제목","내용",UUID.randomUUID().toString(),null,ids[1],null,null,null)));
        var result=conversations.create(actor,new SupportGeneralCreateRequest(SupportCategory.OTHER,"제목","내용",UUID.randomUUID().toString(),null,null,"/help?token=do-not-store",null,null));
        assertThat(result.contextPath()).isNull();
    }
    @Test void futureAndTooOldOccurrenceAreRejectedWithoutDatabaseFailure() {
        var actor=user();for(var time:List.of(OffsetDateTime.now().plusDays(2),OffsetDateTime.now().minusDays(91)))
            status(400,()->conversations.create(actor,new SupportGeneralCreateRequest(SupportCategory.OTHER,"제목","내용",UUID.randomUUID().toString(),null,null,null,null,time)));
    }
    @Test void anotherUserCannotReadReplyResolveOrAttachToTicket() {
        var owner=user();var stranger=user();var id=create(owner).inquiryId();
        status(404,()->conversations.view(stranger,id));status(404,()->conversations.messages(stranger,id,null));
        status(404,()->conversations.append(stranger,id,new SupportMessageRequest("내용",UUID.randomUUID().toString(),false)));
        status(404,()->conversations.resolve(stranger,id,true));
        status(404,()->attachmentState.reserve(stranger,id,UUID.randomUUID().toString()));
        status(403,()->conversations.view(SupportActor.operator(stranger.userId()),id));
    }
    @Test void userAndOperatorCanContinueConversationAndConfirmOrReopenResolution() {
        var owner=user();var op=operator();var id=create(owner).inquiryId();
        conversations.append(op,id,new SupportMessageRequest("어느 단계인가요?",UUID.randomUUID().toString(),true));
        assertThat(conversations.detail(owner,id).status()).isEqualTo(SupportInquiryStatus.WAITING_USER);
        conversations.append(owner,id,new SupportMessageRequest("3D 버튼 다음 단계예요.",UUID.randomUUID().toString(),false));
        assertThat(conversations.detail(owner,id).status()).isEqualTo(SupportInquiryStatus.IN_PROGRESS);
        assertThat(conversations.resolve(owner,id,true).status()).isEqualTo(SupportInquiryStatus.RESOLVED);
        status(409,()->conversations.append(owner,id,new SupportMessageRequest("추가",UUID.randomUUID().toString(),false)));
        assertThat(conversations.resolve(owner,id,false).status()).isEqualTo(SupportInquiryStatus.IN_PROGRESS);
        assertThat(conversations.view(owner,id).messages().items()).hasSize(2);
        assertThat(conversations.detail(owner,id).reply()).isEqualTo("어느 단계인가요?");
    }
    @Test void duplicateMessageIsSavedAndNotifiedOnce() throws Exception {
        var owner=user();var op=operator();var id=create(owner).inquiryId();reset(broker);
        var request=new SupportMessageRequest("추가 설명",UUID.randomUUID().toString(),false);
        var result=simultaneous(()->conversations.append(owner,id,request).messageId());
        assertThat(result.get(0)).isEqualTo(result.get(1));assertThat(messages.countByInquiryId(id)).isEqualTo(1);
        verify(broker,times(1)).convertAndSend(eq("/topic/users/"+op.userId()+"/notifications"),any(Object.class));
        status(409,()->conversations.append(owner,id,new SupportMessageRequest("다른 설명",request.requestId(),false)));
        status(400,()->conversations.append(owner,id,new SupportMessageRequest("권한 위조",UUID.randomUUID().toString(),true)));
    }
    @Test void messageCursorIsBoundedAndDoesNotRepeatPreviousPage() {
        var owner=user();var id=create(owner).inquiryId();
        new TransactionTemplate(transactions).executeWithoutResult(tx->{for(int n=0;n<45;n++)messages.save(new SupportMessage(id,owner.userId(),"USER","설명 "+n,null,false,SupportInquiryPersistenceService.now()));});
        var first=conversations.view(owner,id).messages();var second=conversations.messages(owner,id,first.nextBefore());
        assertThat(first.items()).hasSize(20);assertThat(second.items()).hasSize(20);
        assertThat(first.items().stream().map(SupportMessageResponse::messageId)).doesNotContainAnyElementsOf(second.items().stream().map(SupportMessageResponse::messageId).toList());
    }
    @Test void hourlyAndPerTicketMessageLimitsAreEnforced() {
        var owner=user();var id=create(owner).inquiryId();
        new TransactionTemplate(transactions).executeWithoutResult(tx->{var limit=rates.lock("support-message:"+owner.scope());for(int n=0;n<50;n++)limit.consume(50,Duration.ofHours(1),SupportInquiryPersistenceService.now());});
        status(429,()->conversations.append(owner,id,new SupportMessageRequest("추가",UUID.randomUUID().toString(),false)));
        var other=user();var second=create(other).inquiryId();
        new TransactionTemplate(transactions).executeWithoutResult(tx->{for(int n=0;n<100;n++)messages.save(new SupportMessage(second,other.userId(),"USER","설명",null,false,SupportInquiryPersistenceService.now()));});
        status(409,()->conversations.append(other,second,new SupportMessageRequest("101번째",UUID.randomUUID().toString(),false)));
    }
    @Test void operatorCanAnswerManyInquiriesButStillHasAnHourlyLimit() {
        var owner=user();var op=operator();var id=create(owner).inquiryId();
        new TransactionTemplate(transactions).executeWithoutResult(tx->{var limit=rates.lock("support-message:"+op.scope());for(int n=0;n<999;n++)limit.consume(1000,Duration.ofHours(1),SupportInquiryPersistenceService.now());});
        assertThat(conversations.append(op,id,new SupportMessageRequest("여러 문의에 대한 안내",UUID.randomUUID().toString(),false)).role()).isEqualTo("OPERATOR");
        status(429,()->conversations.append(op,id,new SupportMessageRequest("한도 초과",UUID.randomUUID().toString(),false)));
    }
    @Test void expiredConversationIsHiddenAndPhysicallyRedacted() {
        var owner=user();var id=create(owner).inquiryId();conversations.append(owner,id,new SupportMessageRequest("민감한 설명",UUID.randomUUID().toString(),false));
        new TransactionTemplate(transactions).executeWithoutResult(tx->ReflectionTestUtils.setField(inquiries.findById(id).orElseThrow(),"contentExpiresAt",SupportInquiryPersistenceService.now().minusSeconds(1)));
        assertThat(conversations.view(owner,id).inquiry().description()).isEmpty();assertThat(conversations.view(owner,id).messages().items()).isEmpty();
        status(410,()->conversations.messages(owner,id,null));legacy.redact(id);
        assertThat(messages.findByInquiryIdAndMessageIdLessThanOrderByMessageIdDesc(id,Long.MAX_VALUE,org.springframework.data.domain.PageRequest.of(0,1)).get(0).getContent()).isEmpty();
    }
    @Test void guestSessionIsSeparateFromAccountAndOtherGuestAndHasNoMemberContext() {
        var first=guests.issue(null,"192.0.2."+UUID.randomUUID());var guest=guests.require(first.token());var second=guests.issue(null,"192.0.2."+UUID.randomUUID());
        assertThat(guests.issue(first.token(),"192.0.2.1").token()).isNull();
        var id=conversations.create(guest,request(SupportCategory.LOGIN_ACCOUNT,UUID.randomUUID().toString())).inquiryId();
        assertThat(conversations.detail(guest,id).guest()).isTrue();status(404,()->conversations.view(guests.require(second.token()),id));
        status(404,()->conversations.view(user(),id));status(400,()->conversations.create(guest,request(SupportCategory.OTHER,UUID.randomUUID().toString())));
        var op=operator();conversations.append(op,id,new SupportMessageRequest("안내드립니다.",UUID.randomUUID().toString(),false));
        assertThat(conversations.view(guest,id).messages().items()).hasSize(1);
        new TransactionTemplate(transactions).executeWithoutResult(tx->ReflectionTestUtils.setField(sessions.findById(guest.guestSessionId()).orElseThrow(),"expiresAt",SupportInquiryPersistenceService.now().minusSeconds(1)));
        status(401,()->guests.require(first.token()));
    }
    @Test void invalidGuestTokensDoNotAuthenticateAndSessionIssueIsRateLimited() {
        for(String token:List.of("", "x", "A".repeat(43)))status(401,()->guests.require(token));
        String address="192.0.2."+UUID.randomUUID();
        new TransactionTemplate(transactions).executeWithoutResult(tx->{var limit=rates.lock("guest-session-ip:"+address);for(int n=0;n<60;n++)limit.consume(60,Duration.ofHours(1),SupportInquiryPersistenceService.now());});
        status(429,()->guests.issue(null,address));
    }
    static MockMultipartFile image() throws Exception {
        var output=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(24,16,BufferedImage.TYPE_INT_RGB),"png",output);
        return new MockMultipartFile("image","screen.png","image/png",output.toByteArray());
    }
    @Test void attachmentIsValidatedStoredOutsideTransactionAndReplayDoesNotUploadAgain() throws Exception {
        var owner=user();var id=create(owner).inquiryId();String requestId=UUID.randomUUID().toString();
        when(s3.putObject(any(PutObjectRequest.class),any(software.amazon.awssdk.core.sync.RequestBody.class))).thenAnswer(call->{assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();return PutObjectResponse.builder().build();});
        var first=uploads.upload(owner,id,requestId,image(),true);var replay=uploads.upload(owner,id,requestId,image(),true);
        assertThat(first.attachmentId()).isEqualTo(replay.attachmentId());assertThat(attachmentState.list(owner,id)).hasSize(1);
        verify(s3,times(1)).putObject(any(PutObjectRequest.class),any(software.amazon.awssdk.core.sync.RequestBody.class));
        assertThat(conversations.view(owner,id).attachments()).hasSize(1);
    }
    @Test void guestCanUploadScreenshotAndRetryWithoutCreatingAnotherInquiry() throws Exception {
        var issued=guests.issue(null,"192.0.2."+UUID.randomUUID());var guest=guests.require(issued.token());
        var ticket=conversations.create(guest,request(SupportCategory.LOGIN_ACCOUNT,UUID.randomUUID().toString()));
        String requestId=UUID.randomUUID().toString();
        var stored=uploads.upload(guest,ticket.inquiryId(),requestId,image(),true);
        assertThat(stored.status()).isEqualTo("READY");
        assertThat(uploads.upload(guest,ticket.inquiryId(),requestId,image(),true).attachmentId()).isEqualTo(stored.attachmentId());
        assertThat(conversations.view(guest,ticket.inquiryId()).attachments()).hasSize(1);
        assertThat(conversations.guestList(guest,null).items()).hasSize(1);
        var other=guests.require(guests.issue(null,"192.0.2."+UUID.randomUUID()).token());
        status(404,()->uploads.upload(other,ticket.inquiryId(),UUID.randomUUID().toString(),image(),true));
        verify(s3,times(1)).putObject(any(PutObjectRequest.class),any(software.amazon.awssdk.core.sync.RequestBody.class));
    }
    @Test void storageFailureLogsOnlySafeCategoryAndPreservesGuestInquiryForRetry() throws Exception {
        var issued=guests.issue(null,"192.0.2."+UUID.randomUUID());var guest=guests.require(issued.token());
        var ticket=conversations.create(guest,request(SupportCategory.LOGIN_ACCOUNT,UUID.randomUUID().toString()));
        var logger=(ch.qos.logback.classic.Logger)org.slf4j.LoggerFactory.getLogger(SupportAttachmentService.class);
        var capture=new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();capture.start();logger.addAppender(capture);
        try {
            when(s3.putObject(any(PutObjectRequest.class),any(software.amazon.awssdk.core.sync.RequestBody.class)))
                    .thenThrow(S3Exception.builder().statusCode(403).awsErrorDetails(software.amazon.awssdk.awscore.exception.AwsErrorDetails.builder()
                            .errorCode("AccessDenied").errorMessage("private-bucket/private-user-key-do-not-log").build()).build());
            status(503,()->uploads.upload(guest,ticket.inquiryId(),UUID.randomUUID().toString(),image(),true));
            assertThat(capture.list).extracting(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage)
                    .anySatisfy(line->assertThat(line).contains("category=S3","s3Status=403","errorCode=AccessDenied"));
            assertThat(capture.list).allSatisfy(event->{assertThat(event.getFormattedMessage()).doesNotContain("private-bucket","private-user-key");assertThat(event.getThrowableProxy()).isNull();});
            assertThat(conversations.detail(guest,ticket.inquiryId()).description()).isEqualTo("문의 내용");
            when(s3.putObject(any(PutObjectRequest.class),any(software.amazon.awssdk.core.sync.RequestBody.class))).thenReturn(PutObjectResponse.builder().build());
            assertThat(uploads.upload(guest,ticket.inquiryId(),UUID.randomUUID().toString(),image(),true).status()).isEqualTo("READY");
            assertThat(conversations.guestList(guest,null).items()).hasSize(1);
        } finally {logger.detachAppender(capture);capture.stop();}
    }
    @Test void attachmentCapAndSharingConsentAreServerSide() throws Exception {
        var owner=user();var id=create(owner).inquiryId();
        status(400,()->uploads.upload(owner,id,UUID.randomUUID().toString(),image(),false));
        for(int n=0;n<3;n++)attachmentState.reserve(owner,id,UUID.randomUUID().toString());
        status(409,()->attachmentState.reserve(owner,id,UUID.randomUUID().toString()));
        status(413,()->uploads.upload(owner,id,UUID.randomUUID().toString(),new MockMultipartFile("image",new byte[2*1024*1024+1]),true));
        verifyNoInteractions(s3);
    }
    @Test void failedExternalUploadPreservesCleanupKeyAndCommittedAttachmentSurvivesUnknownResult() throws Exception {
        var owner=user();var id=create(owner).inquiryId();String requestId=UUID.randomUUID().toString();
        when(s3.putObject(any(PutObjectRequest.class),any(software.amazon.awssdk.core.sync.RequestBody.class))).thenThrow(S3Exception.builder().statusCode(503).build());
        status(503,()->uploads.upload(owner,id,requestId,image(),true));
        assertThat(attachments.findByInquiryIdAndClientRequestId(id,requestId).orElseThrow().getStatus()).isEqualTo("FAILED");
        var target=attachmentState.reserve(owner,id,UUID.randomUUID().toString());attachmentState.finish(owner,target,100);
        assertThat(attachmentState.failedOrCommitted(owner,target).status()).isEqualTo("READY");
        verify(s3,never()).deleteObject(any(DeleteObjectRequest.class));
    }
    @Test void onlyTwoImagesUseCpuOrExternalUploadAtOnceAndExtraRequestReceives429() throws Exception {
        var owner=user();var id=create(owner).inquiryId();var entered=new CountDownLatch(2);var release=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        when(s3.putObject(any(PutObjectRequest.class),any(software.amazon.awssdk.core.sync.RequestBody.class))).thenAnswer(call->{entered.countDown();if(!release.await(15,TimeUnit.SECONDS))throw new AssertionError("저장 시험 대기 초과");return PutObjectResponse.builder().build();});
        try {Callable<SupportAttachmentResponse> upload=()->uploads.upload(owner,id,UUID.randomUUID().toString(),image(),true);
            var a=pool.submit(upload);var b=pool.submit(upload);assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();
            status(429,()->uploads.upload(owner,id,UUID.randomUUID().toString(),image(),true));release.countDown();
            assertThat(a.get(20,TimeUnit.SECONDS).status()).isEqualTo("READY");assertThat(b.get(20,TimeUnit.SECONDS).status()).isEqualTo("READY");
        } finally {release.countDown();pool.shutdownNow();}
    }
    @Test void viewUsesThreeQueriesWhetherOneOrManyMessagesExist() {
        var owner=user();var id=create(owner).inquiryId();var statistics=emf.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        statistics.clear();conversations.view(owner,id);assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        new TransactionTemplate(transactions).executeWithoutResult(tx->{for(int n=0;n<45;n++)messages.save(new SupportMessage(id,owner.userId(),"USER","추가 설명",null,false,SupportInquiryPersistenceService.now()));});
        statistics.clear();assertThat(conversations.view(owner,id).messages().items()).hasSize(20);assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
    }
    @Test void expiredAttachmentIsHiddenAndDeletionFailureCanBeRetried() throws Exception {
        var owner=user();var id=create(owner).inquiryId();var target=attachmentState.reserve(owner,id,UUID.randomUUID().toString());attachmentState.finish(owner,target,100);
        new TransactionTemplate(transactions).executeWithoutResult(tx->ReflectionTestUtils.setField(attachments.findById(target.id()).orElseThrow(),"expiresAt",SupportInquiryPersistenceService.now().minusSeconds(1)));
        assertThat(conversations.view(owner,id).attachments()).isEmpty();status(410,()->attachmentState.preview(owner,id,target.id()));
        when(s3.deleteObject(any(DeleteObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(503).build());uploads.cleanup();
        assertThat(attachments.findById(target.id()).orElseThrow().getDeletedAt()).isNull();
        when(s3.deleteObject(any(DeleteObjectRequest.class))).thenReturn(DeleteObjectResponse.builder().build());uploads.cleanup();
        assertThat(attachments.findById(target.id()).orElseThrow().getDeletedAt()).isNotNull();
    }
    @Test void resolveAndMessageRaceCannotCorruptOrReopenResolvedInquiry() throws Exception {
        var owner=user();var id=create(owner).inquiryId();var sequence=new java.util.concurrent.atomic.AtomicInteger();
        var results=simultaneous(()->{
            try {
                if(sequence.getAndIncrement()==0)conversations.resolve(owner,id,true);
                else conversations.append(owner,id,new SupportMessageRequest("동시 설명",UUID.randomUUID().toString(),false));
                return 200;
            }catch(ResponseStatusException e){return e.getStatusCode().value();}
        });
        assertThat(results).allMatch(code->code==200||code==409);assertThat(conversations.detail(owner,id).status()).isEqualTo(SupportInquiryStatus.RESOLVED);
    }
}
