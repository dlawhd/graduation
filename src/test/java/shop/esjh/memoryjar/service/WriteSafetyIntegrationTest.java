package shop.esjh.memoryjar.service;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.List;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.dto.jar.request.JarInviteJoinRequest;
import shop.esjh.memoryjar.dto.jar.request.JarUpdateRequest;
import shop.esjh.memoryjar.dto.jar.request.JarMemberRoleUpdateRequest;
import shop.esjh.memoryjar.entity.note.NoteComment;
import shop.esjh.memoryjar.enums.jar.JarRole;
import shop.esjh.memoryjar.enums.note.NoteReactionEmoji;
import shop.esjh.memoryjar.repository.jar.*;
import shop.esjh.memoryjar.repository.note.*;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import shop.esjh.memoryjar.service.jar.*;
import shop.esjh.memoryjar.service.note.*;
import shop.esjh.memoryjar.service.notification.NotificationService;
import shop.esjh.memoryjar.service.chat.ChatSystemMessageService;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/** 실제 MariaDB 잠금과 페이징·일괄 삭제로 첫 리액션 경쟁, 정원 경쟁, 깊은 답글을 검증한다. */
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ JpaAuditConfig.class, JarService.class, NoteReactionService.class, NoteCommentService.class, NoteService.class, NoteAttachmentService.class, JarDailyDrawService.class, shop.esjh.memoryjar.service.chat.ChatService.class })
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class WriteSafetyIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired PlatformTransactionManager transactions;
    @Autowired JarService jars;
    @Autowired NoteReactionService reactions;
    @Autowired NoteCommentService comments;
    @Autowired JarRepository jarRepository;
    @Autowired JarMemberRepository members;
    @Autowired NoteReactionRepository reactionRepository;
    @Autowired NoteCommentRepository commentRepository;
    @Autowired NoteService noteWrites;
    @Autowired shop.esjh.memoryjar.repository.file.FileUploadRepository uploads;
    @Autowired NoteAttachmentRepository attachments;
    @Autowired NoteAttachmentService noteAttachments;
    @Autowired JarDailyDrawService dailyDraws;
    @Autowired shop.esjh.memoryjar.service.chat.ChatService chats;
    @MockitoBean JarDailyDrawRealtimeService drawRealtime;
    @MockitoBean JarOpenService openService;
    @MockitoBean NotificationService notifications;
    @MockitoBean NoteRealtimeService noteRealtime;
    @MockitoBean JarMemberRealtimeService memberRealtime;
    @MockitoBean ChatSystemMessageService systemMessages;
    @MockitoBean JarDesignViewService designViews;
    // 이 검사는 실제 DB 잠금·권한 경쟁을 검증한다. 화면 갱신 전송은 다른 통합 검사에서 확인한다.
    @MockitoBean UserStateRealtimeService userStateRealtime;

    private record Fixture(Long ownerId, Long guestId, Long jarId, Long noteId, String code) { }

    private Fixture fixture() {
        return new TransactionTemplate(transactions).execute(status -> {
            String unique = UUID.randomUUID().toString();
            var owner = saveUser(unique, unique + "@example.com", "작성자");
            var guest = saveUser(unique + "-guest", unique + "-guest@example.com", "친구");
            var jar = saveJar(owner, "동시성 검증", LocalDateTime.now().plusDays(1));
            jar.updateInfo(jar.getName(), jar.getDescription(), jar.getTheme(), 2, jar.getOpenAt(), jar.getOpenMode(), jar.getLockLevel());
            saveJarMember(jar, owner, JarRole.OWNER, LocalDateTime.now());
            var note = saveNote(jar, owner, "시험 쪽지", LocalDateTime.now());
            saveJarInvite(jar, owner, unique, LocalDateTime.now().plusDays(1), 2);
            return new Fixture(owner.getId(), guest.getId(), jar.getJarId(), note.getNoteId(), unique);
        });
    }

    @Test
    void firstConcurrentSameReactionsAreSerializedAsTwoToggles() throws Exception {
        var f = fixture();
        when(openService.ensureOpenedIfDue(f.jarId)).thenReturn(true);
        var executor = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            Callable<Object> call = () -> { start.await(); return reactions.react(f.ownerId, f.jarId, f.noteId, NoteReactionEmoji.LOVE); };
            var a = executor.submit(call);
            var b = executor.submit(call);
            start.countDown();
            a.get(20, TimeUnit.SECONDS);
            b.get(20, TimeUnit.SECONDS);
            assertThat(reactionRepository.findByNote_NoteIdAndUser_Id(f.noteId, f.ownerId)).isEmpty();
        } finally { executor.shutdownNow(); }
    }

    @Test
    void capacityShrinkAndInviteJoinCannotOverfillJar() throws Exception {
        for (int iteration = 0; iteration < 6; iteration++) {
            var f = fixture();
            // DTO가 허용하는 최소 정원(2)으로 줄이는 실제 요청 조건을 만든다.
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                var jar = jarRepository.findByJarId(f.jarId).orElseThrow();
                jar.updateInfo(jar.getName(), jar.getDescription(), jar.getTheme(), 3, jar.getOpenAt(), jar.getOpenMode(), jar.getLockLevel());
                var extra = saveUser(UUID.randomUUID().toString(), UUID.randomUUID() + "@example.com", "기존 친구");
                saveJarMember(jar, extra, JarRole.MEMBER, LocalDateTime.now());
            });
            var executor = Executors.newFixedThreadPool(2);
            var start = new CountDownLatch(1);
            try {
                var shrink = executor.submit(() -> {
                    start.await();
                    try { jars.updateJar(f.ownerId, f.jarId, new JarUpdateRequest(null, null, null, 2, null, null, null)); return true; }
                    catch (ResponseStatusException e) { assertThat(e.getStatusCode().value()).isEqualTo(400); return false; }
                });
                var join = executor.submit(() -> {
                    start.await();
                    try { jars.joinByInvite(f.guestId, new JarInviteJoinRequest(f.code)); return true; }
                    catch (ResponseStatusException e) { assertThat(e.getStatusCode().value()).isEqualTo(400); return false; }
                });
                start.countDown();
                assertThat(shrink.get(20, TimeUnit.SECONDS)).isNotEqualTo(join.get(20, TimeUnit.SECONDS));
                assertThat(members.countByJar_JarIdAndDeletedAtIsNull(f.jarId))
                        .isLessThanOrEqualTo(jarRepository.findByJarId(f.jarId).orElseThrow().getMaxMembers());
            } finally { executor.shutdownNow(); }
        }
    }

    /** 역할 변경의 미커밋 값을 강퇴·탈퇴가 추월하지 못하고, 최종적으로 탈퇴 상태가 유지된다. */
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void roleChangeAndRemovalCannotRestoreMembership(boolean selfLeave) throws Exception {
        var f = fixture();
        jars.joinByInvite(f.guestId, new JarInviteJoinRequest(f.code));
        var pool = Executors.newFixedThreadPool(2);
        var changed = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var removalStarted = new CountDownLatch(1);
        var removalFinished = new CountDownLatch(1);
        try {
            var role = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                jars.updateMemberRole(f.ownerId, f.jarId, f.guestId, new JarMemberRoleUpdateRequest(JarRole.ADMIN));
                changed.countDown();
                await(release);
            }));
            assertThat(changed.await(10, TimeUnit.SECONDS)).isTrue();
            var removal = pool.submit(() -> {
                removalStarted.countDown();
                try {
                    if (selfLeave) jars.leaveJar(f.guestId, f.jarId);
                    else jars.kickMember(f.ownerId, f.jarId, f.guestId);
                } finally { removalFinished.countDown(); }
            });
            assertThat(removalStarted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(removalFinished.await(300, TimeUnit.MILLISECONDS)).isFalse();
            release.countDown();
            role.get(15, TimeUnit.SECONDS);
            removal.get(15, TimeUnit.SECONDS);
            var inactive = new TransactionTemplate(transactions).execute(status ->
                    members.findAnyByJarIdAndUserIdIncludingDeleted(f.jarId, f.guestId).orElseThrow());
            assertThat(inactive.isActive()).isFalse();
            assertThat(inactive.getLeftAt()).isNotNull();
            assertThat(inactive.getDeletedAt()).isNotNull();
        } finally { release.countDown(); pool.shutdownNow(); }
    }

    /** 관리자 권한을 기다리는 동안 박탈당했다면 잠금 해제 후 최신 권한으로 거절해야 한다. */
    @Test
    void demotedAdminCannotKickUsingPreviouslyReadRole() throws Exception {
        var f = fixture();
        jars.joinByInvite(f.guestId, new JarInviteJoinRequest(f.code));
        jars.updateMemberRole(f.ownerId, f.jarId, f.guestId, new JarMemberRoleUpdateRequest(JarRole.ADMIN));
        Long third = new TransactionTemplate(transactions).execute(status -> {
            var user = saveUser(UUID.randomUUID().toString(), UUID.randomUUID() + "@example.com", "다른 친구");
            var jar = jarRepository.findByJarId(f.jarId).orElseThrow();
            saveJarMember(jar, user, JarRole.MEMBER, LocalDateTime.now());
            return user.getId();
        });
        var pool = Executors.newFixedThreadPool(2);
        var demoted = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try {
            var demotion = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                jars.updateMemberRole(f.ownerId, f.jarId, f.guestId, new JarMemberRoleUpdateRequest(JarRole.MEMBER));
                demoted.countDown(); await(release);
            }));
            assertThat(demoted.await(10, TimeUnit.SECONDS)).isTrue();
            var kick = pool.submit(() -> {
                try { jars.kickMember(f.guestId, f.jarId, third); return 200; }
                catch (ResponseStatusException denied) { return denied.getStatusCode().value(); }
            });
            release.countDown();
            demotion.get(15, TimeUnit.SECONDS);
            assertThat(kick.get(15, TimeUnit.SECONDS)).isEqualTo(403);
            assertThat(members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(f.jarId, third)).isTrue();
        } finally { release.countDown(); pool.shutdownNow(); }
    }

    /** 서로를 강퇴하는 관리자 요청도 반대 순서의 행 잠금으로 멈추지 않아야 한다. */
    @Test
    void opposingAdminKicksUseTheSameLockOrder() throws Exception {
        var f = fixture();
        jars.joinByInvite(f.guestId, new JarInviteJoinRequest(f.code));
        jars.updateMemberRole(f.ownerId, f.jarId, f.guestId, new JarMemberRoleUpdateRequest(JarRole.ADMIN));
        Long other = new TransactionTemplate(transactions).execute(status -> {
            var user = saveUser(UUID.randomUUID().toString(), UUID.randomUUID() + "@example.com", "다른 관리자");
            var member = saveJarMember(jarRepository.findByJarId(f.jarId).orElseThrow(), user, JarRole.ADMIN, LocalDateTime.now());
            return user.getId();
        });
        var pool = Executors.newFixedThreadPool(2); var start = new CountDownLatch(1);
        try {
            var first = pool.submit(() -> { await(start); return kickStatus(f.guestId, f.jarId, other); });
            var second = pool.submit(() -> { await(start); return kickStatus(other, f.jarId, f.guestId); });
            start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 403);
        } finally { pool.shutdownNow(); }
    }

    private int kickStatus(Long actor, Long jar, Long target) {
        try { jars.kickMember(actor, jar, target); return 200; }
        catch (ResponseStatusException denied) { return denied.getStatusCode().value(); }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("동시성 시험 대기 시간 초과");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted);
        }
    }


    /** 수정과 삭제의 실행 순서를 고정해 삭제된 답글이 다시 살아나지 않는지 확인한다. */
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {true, false})
    void commentUpdateAndDeleteUseSameNoteLock(boolean updateFirst) throws Exception {
        var f = fixture();
        Long id = new TransactionTemplate(transactions).execute(status -> {
            var note = entityManager.find(shop.esjh.memoryjar.entity.note.Note.class, f.noteId);
            var user = entityManager.find(shop.esjh.memoryjar.entity.User.class, f.ownerId);
            var comment = NoteComment.builder().note(note).user(user).content("기존").build();
            entityManager.persist(comment); return comment.getCommentId();
        });
        var firstDone = new CountDownLatch(1); var release = new CountDownLatch(1);
        var secondStarted = new CountDownLatch(1); var pool = Executors.newFixedThreadPool(2);
        var request = new shop.esjh.memoryjar.dto.note.request.NoteCommentUpdateRequest("수정");
        try {
            var first = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                if (updateFirst) comments.updateComment(f.ownerId, f.jarId, f.noteId, id, request);
                else comments.deleteComment(f.ownerId, f.jarId, f.noteId, id);
                firstDone.countDown(); await(release);
            }));
            assertThat(firstDone.await(10, TimeUnit.SECONDS)).isTrue();
            var second = pool.submit(() -> {
                secondStarted.countDown();
                try {
                    if (updateFirst) comments.deleteComment(f.ownerId, f.jarId, f.noteId, id);
                    else comments.updateComment(f.ownerId, f.jarId, f.noteId, id, request);
                    return 200;
                } catch (ResponseStatusException missing) { return missing.getStatusCode().value(); }
            });
            assertThat(secondStarted.await(10, TimeUnit.SECONDS)).isTrue();
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> second.get(150, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            release.countDown(); first.get(15, TimeUnit.SECONDS);
            assertThat(second.get(15, TimeUnit.SECONDS)).isEqualTo(updateFirst ? 200 : 404);
            assertThat(commentRepository.findByCommentId(id)).isEmpty();
        } finally { release.countDown(); pool.shutdownNow(); }
    }


    @Test
    void deepRepliesRemainAllowedAndDeleteWithoutRecursion() {
        var f = fixture();
        var deepest = new java.util.concurrent.atomic.AtomicReference<Long>();
        Long root = new TransactionTemplate(transactions).execute(status -> {
            var note = entityManager.find(shop.esjh.memoryjar.entity.note.Note.class, f.noteId);
            var owner = entityManager.find(shop.esjh.memoryjar.entity.User.class, f.ownerId);
            NoteComment parent = null;
            Long rootId = null;
            for (int depth = 0; depth < 1100; depth++) {
                var comment = NoteComment.builder().note(note).user(owner).content("답글 " + depth).parentComment(parent).build();
                entityManager.persist(comment);
                if (rootId == null) rootId = comment.getCommentId();
                parent = comment;
                deepest.set(comment.getCommentId());
            }
            return rootId;
        });
        var page = comments.getCommentPage(f.ownerId, f.jarId, f.noteId, 0L, 30, null);
        assertThat(page.items()).hasSize(30);
        assertThat(page.items()).allSatisfy(item -> assertThat(item.replies()).isEmpty());
        assertThat(page.totalCount()).isEqualTo(1100);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> comments.getCommentList(f.ownerId, f.jarId, f.noteId))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("/comments/page");
        assertThat(page.hasMore()).isTrue();
        var next = comments.getCommentPage(f.ownerId, f.jarId, f.noteId, page.nextCursor(), 30, null);
        assertThat(next.items().get(0).commentId()).isGreaterThan(page.nextCursor());
        var focused = comments.getCommentPage(f.ownerId, f.jarId, f.noteId, 0L, 30, deepest.get());
        assertThat(focused.items()).hasSize(1100);
        assertThat(focused.nextCursor()).isEqualTo(page.nextCursor());
        comments.deleteComment(f.ownerId, f.jarId, f.noteId, root);
        assertThat(commentRepository.countByNote_NoteId(f.noteId)).isZero();
    }


    /** 잠금 대기 중 관리자 권한이 바뀌면 최신 권한으로 세 쓰기 기능 모두 거절한다. */
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"update", "create-invite", "revoke-invite"})
    void demotedAdminCannotWriteJarOrInvites(String action) throws Exception {
        var f = fixture(); jars.joinByInvite(f.guestId, new JarInviteJoinRequest(f.code));
        jars.updateMemberRole(f.ownerId, f.jarId, f.guestId, new JarMemberRoleUpdateRequest(JarRole.ADMIN));
        var invite = jars.createInvite(f.ownerId, f.jarId, new shop.esjh.memoryjar.dto.jar.request.JarInviteCreateRequest(24, 1));
        var demoted = new CountDownLatch(1); var release = new CountDownLatch(1);
        var started = new CountDownLatch(1); var pool = Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                jars.updateMemberRole(f.ownerId, f.jarId, f.guestId, new JarMemberRoleUpdateRequest(JarRole.MEMBER));
                demoted.countDown(); await(release);
            }));
            assertThat(demoted.await(10, TimeUnit.SECONDS)).isTrue();
            var write = pool.submit(() -> {
                started.countDown();
                try {
                    switch (action) {
                        case "update" -> jars.updateJar(f.guestId, f.jarId, new JarUpdateRequest("권한 없는 변경", null, null, null, null, null, null));
                        case "create-invite" -> jars.createInvite(f.guestId, f.jarId, new shop.esjh.memoryjar.dto.jar.request.JarInviteCreateRequest(24, 1));
                        default -> jars.revokeInvite(f.guestId, f.jarId, invite.inviteId());
                    }
                    return 200;
                } catch (ResponseStatusException denied) { return denied.getStatusCode().value(); }
            });
            assertThat(started.await(10, TimeUnit.SECONDS)).isTrue();
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> write.get(150, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); first.get(15, TimeUnit.SECONDS);
            assertThat(write.get(15, TimeUnit.SECONDS)).isEqualTo(403);
        } finally { release.countDown(); pool.shutdownNow(); }
    }

    @Test
    void concurrentNoteWritesCanConsumeOneUploadOnlyOnce() throws Exception {
        var f = fixture(); String key = "notes/" + UUID.randomUUID() + ".png";
        Long uploadId = new TransactionTemplate(transactions).execute(tx -> saveFileUpload(
                entityManager.find(shop.esjh.memoryjar.entity.User.class, f.ownerId),
                shop.esjh.memoryjar.enums.file.FilePurpose.NOTE, shop.esjh.memoryjar.enums.file.FileUploadStatus.COMPLETED, key).getId());
        var request = new shop.esjh.memoryjar.dto.note.request.NoteCreateRequest("첨부 시험", "본문", null, null,
                List.of(new shop.esjh.memoryjar.dto.note.request.NoteAttachmentCreateRequest(key)), List.of());
        var pool = Executors.newFixedThreadPool(3); var start = new CountDownLatch(1);
        var locked = new CountDownLatch(1); var releaseUpload = new CountDownLatch(1);
        try {
            var holder = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                uploads.findByIdForUpdate(uploadId).orElseThrow(); locked.countDown(); await(releaseUpload);
            }));
            assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
            Callable<Integer> call = () -> {
                start.await();
                try { noteWrites.createNote(f.ownerId, f.jarId, request); return 201; }
                catch (ResponseStatusException conflict) { return conflict.getStatusCode().value(); }
            };
            var a = pool.submit(call); var b = pool.submit(call); start.countDown();
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> a.get(250, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> b.get(250, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            releaseUpload.countDown(); holder.get(15, TimeUnit.SECONDS);
            var results = List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
            assertThat(results).contains(201).allSatisfy(code -> assertThat(code).isIn(201, 400, 409));
            assertThat(results.stream().filter(v -> v == 201).count()).isEqualTo(1);
            assertThat(attachments.findAllByS3KeyIn(List.of(key))).hasSize(1);
            assertThat(uploads.findByS3Key(key).orElseThrow().getStatus())
                    .isEqualTo(shop.esjh.memoryjar.enums.file.FileUploadStatus.CONSUMED);
        } finally { releaseUpload.countDown(); pool.shutdownNow(); }
    }


    @Test
    void partiallyClaimedAttachmentBatchRollsBackOtherFiles() throws Exception {
        var f = fixture(); var keys = List.of("notes/" + UUID.randomUUID() + ".png", "notes/" + UUID.randomUUID() + ".png");
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var owner = entityManager.find(shop.esjh.memoryjar.entity.User.class, f.ownerId);
            for (String key : keys) saveFileUpload(owner, shop.esjh.memoryjar.enums.file.FilePurpose.NOTE,
                    shop.esjh.memoryjar.enums.file.FileUploadStatus.COMPLETED, key);
        });
        var pool = Executors.newSingleThreadExecutor();
        try {
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                // 먼저 읽은 스냅샷은 두 파일이 모두 사용 가능하다고 알고 있다.
                assertThat(uploads.findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(f.ownerId,
                        shop.esjh.memoryjar.enums.file.FilePurpose.NOTE,
                        shop.esjh.memoryjar.enums.file.FileUploadStatus.COMPLETED, keys)).hasSize(2);
                try {
                    pool.submit(() -> noteWrites.createNote(f.ownerId, f.jarId,
                            new shop.esjh.memoryjar.dto.note.request.NoteCreateRequest("먼저 연결", "본문", null, null,
                                    List.of(new shop.esjh.memoryjar.dto.note.request.NoteAttachmentCreateRequest(keys.get(1))), List.of())))
                            .get(15, TimeUnit.SECONDS);
                } catch (Exception e) { throw new IllegalStateException(e); }
                noteAttachments.createAttachments(f.ownerId, f.noteId, keys.stream()
                        .map(shop.esjh.memoryjar.dto.note.request.NoteAttachmentCreateRequest::new).toList());
            })).isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException)e).getStatusCode().value()).isEqualTo(409));
            assertThat(uploads.findByS3Key(keys.get(0)).orElseThrow().getStatus())
                    .isEqualTo(shop.esjh.memoryjar.enums.file.FileUploadStatus.COMPLETED);
            assertThat(uploads.findByS3Key(keys.get(1)).orElseThrow().getStatus())
                    .isEqualTo(shop.esjh.memoryjar.enums.file.FileUploadStatus.CONSUMED);
            assertThat(attachments.findAllByS3KeyIn(keys)).hasSize(1);
        } finally { pool.shutdownNow(); }
    }

    /** 참여 확정 직전 삭제가 시작돼도 삭제 성공이면 활성 멤버를 하나도 남기지 않는다. */
    @Test
    void deleteRacingWithJoinEitherClosesEveryMemberOrRollsBackCompletely() throws Exception {
        var f = fixture(); var joined = new CountDownLatch(1); var release = new CountDownLatch(1);
        var deleting = new CountDownLatch(1); var pool = Executors.newFixedThreadPool(2);
        try {
            var join = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                jars.joinByInvite(f.guestId, new JarInviteJoinRequest(f.code)); joined.countDown(); await(release);
            }));
            assertThat(joined.await(10, TimeUnit.SECONDS)).isTrue();
            var deletion = pool.submit(() -> {
                deleting.countDown();
                try { jars.deleteJar(f.ownerId, f.jarId); return 204; }
                catch (ResponseStatusException conflict) { return conflict.getStatusCode().value(); }
            });
            assertThat(deleting.await(10, TimeUnit.SECONDS)).isTrue();
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> deletion.get(200, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); join.get(15, TimeUnit.SECONDS);
            int result = deletion.get(15, TimeUnit.SECONDS);
            assertThat(result).isIn(204, 409);
            if (result == 409) {
                assertThat(jarRepository.findByJarId(f.jarId)).isPresent();
                assertThat(members.findActiveUserIds(f.jarId)).containsExactlyInAnyOrder(f.ownerId, f.guestId);
                jars.deleteJar(f.ownerId, f.jarId);
            }
            assertThat(jarRepository.findByJarId(f.jarId)).isEmpty();
            assertThat(members.findActiveUserIds(f.jarId)).isEmpty();
        } finally { release.countDown(); pool.shutdownNow(); }
    }

    @Test
    void focusReplyIncludesOnlyItsAncestorPathBesidesFirstPage() {
        var f = fixture();
        Long focus = new TransactionTemplate(transactions).execute(status -> {
            var note = entityManager.find(shop.esjh.memoryjar.entity.note.Note.class, f.noteId);
            var owner = entityManager.find(shop.esjh.memoryjar.entity.User.class, f.ownerId);
            for (int index = 0; index < 65; index++) entityManager.persist(NoteComment.builder().note(note).user(owner).content("기존 댓글").build());
            var root = NoteComment.builder().note(note).user(owner).content("대상 부모").build(); entityManager.persist(root);
            var reply = NoteComment.builder().note(note).user(owner).content("대상 답글").parentComment(root).build(); entityManager.persist(reply);
            return reply.getCommentId();
        });
        var page = comments.getCommentPage(f.ownerId, f.jarId, f.noteId, 0L, 30, focus);
        assertThat(page.items()).hasSize(32);
        assertThat(page.items().get(page.items().size() - 1).commentId()).isEqualTo(focus);
        assertThat(page.totalCount()).isEqualTo(67);
        assertThat(page.nextCursor()).isLessThan(focus);
    }

    /** 강퇴가 먼저 잠금을 잡으면 모든 쓰기 경로가 기다렸다가 403으로 끝나야 한다. */
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"note", "comment", "update-comment", "delete-comment", "reaction", "legacy-chat", "identified-chat", "draw"})
    void revocationBlocksPendingWrites(String action) throws Exception {
        var f = fixture();
        Long commentId = new TransactionTemplate(transactions).execute(tx -> {
            var jar = entityManager.find(shop.esjh.memoryjar.entity.jar.Jar.class, f.jarId);
            var guest = entityManager.find(shop.esjh.memoryjar.entity.User.class, f.guestId);
            saveJarMember(jar, guest, JarRole.MEMBER, java.time.LocalDateTime.now());
            var comment = NoteComment.builder().note(entityManager.find(shop.esjh.memoryjar.entity.note.Note.class, f.noteId))
                    .user(guest).content("기존 댓글").build(); entityManager.persist(comment);
            return comment.getCommentId();
        });
        var kicked = new CountDownLatch(1); var release = new CountDownLatch(1);
        var writing = new CountDownLatch(1); var pool = Executors.newFixedThreadPool(2);
        try {
            var kick = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                jars.kickMember(f.ownerId, f.jarId, f.guestId); kicked.countDown(); await(release);
            }));
            assertThat(kicked.await(10, TimeUnit.SECONDS)).isTrue();
            var write = pool.submit(() -> {
                writing.countDown();
                try {
                    switch (action) {
                        case "note" -> noteWrites.createNote(f.guestId, f.jarId, new shop.esjh.memoryjar.dto.note.request.NoteCreateRequest("새 쪽지", "본문", null, null, List.of(), List.of()));
                        case "comment" -> comments.createComment(f.guestId, f.jarId, f.noteId, new shop.esjh.memoryjar.dto.note.request.NoteCommentCreateRequest("새 댓글", null));
                        case "update-comment" -> comments.updateComment(f.guestId, f.jarId, f.noteId, commentId, new shop.esjh.memoryjar.dto.note.request.NoteCommentUpdateRequest("변경"));
                        case "delete-comment" -> comments.deleteComment(f.guestId, f.jarId, f.noteId, commentId);
                        case "reaction" -> reactions.react(f.guestId, f.jarId, f.noteId, NoteReactionEmoji.LOVE);
                        case "legacy-chat" -> chats.sendTextMessage(f.guestId, f.jarId, new shop.esjh.memoryjar.dto.chat.request.ChatMessageSendRequest("내용"));
                        case "identified-chat" -> chats.sendTextMessage(f.guestId, f.jarId, new shop.esjh.memoryjar.dto.chat.request.ChatMessageSendRequest("내용", "request-id"));
                        case "draw" -> dailyDraws.drawToday(f.guestId, f.jarId);
                        default -> throw new AssertionError(action);
                    }
                    return 200;
                } catch (ResponseStatusException denied) { return denied.getStatusCode().value(); }
            });
            assertThat(writing.await(10, TimeUnit.SECONDS)).isTrue();
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> write.get(200, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); kick.get(20, TimeUnit.SECONDS);
            assertThat(write.get(20, TimeUnit.SECONDS)).isEqualTo(403);
            assertThat(commentRepository.findById(commentId)).get().extracting(NoteComment::getContent).isEqualTo("기존 댓글");
        } finally { release.countDown(); pool.shutdownNow(); }
    }

    /** 두 번째 요청이 첫 저장 이전에 시작해 잠금을 기다려도 확정된 같은 카드를 반환해야 한다. */
    @Test
    void concurrentDailyDrawReturnsCommittedCardInsteadOfDuplicateInsert() throws Exception {
        var f = fixture();
        new TransactionTemplate(transactions).executeWithoutResult(tx -> saveJarMember(
                entityManager.find(shop.esjh.memoryjar.entity.jar.Jar.class, f.jarId),
                entityManager.find(shop.esjh.memoryjar.entity.User.class, f.guestId), JarRole.MEMBER, java.time.LocalDateTime.now()));
        when(openService.ensureOpenedIfDue(f.jarId)).thenReturn(true);
        var saved = new CountDownLatch(1); var release = new CountDownLatch(1);
        var drawing = new CountDownLatch(1); var pool = Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> new TransactionTemplate(transactions).execute(tx -> {
                var card = dailyDraws.drawToday(f.ownerId, f.jarId); saved.countDown(); await(release); return card;
            }));
            assertThat(saved.await(10, TimeUnit.SECONDS)).isTrue();
            var second = pool.submit(() -> { drawing.countDown(); return dailyDraws.drawToday(f.guestId, f.jarId); });
            assertThat(drawing.await(10, TimeUnit.SECONDS)).isTrue();
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> second.get(200, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); var a = first.get(20, TimeUnit.SECONDS); var b = second.get(20, TimeUnit.SECONDS);
            assertThat(a.newlyDrawn()).isTrue(); assertThat(b.newlyDrawn()).isFalse();
            assertThat(b.drawId()).isEqualTo(a.drawId());
        } finally { release.countDown(); pool.shutdownNow(); }
    }
}
