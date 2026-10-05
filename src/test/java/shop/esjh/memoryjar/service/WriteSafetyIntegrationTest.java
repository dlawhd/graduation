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
@Import({ JpaAuditConfig.class, JarService.class, NoteReactionService.class, NoteCommentService.class })
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
    @MockitoBean JarOpenService openService;
    @MockitoBean NotificationService notifications;
    @MockitoBean NoteRealtimeService noteRealtime;
    @MockitoBean JarMemberRealtimeService memberRealtime;
    @MockitoBean ChatSystemMessageService systemMessages;
    @MockitoBean JarDesignViewService designViews;

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

    @Test
    void deepRepliesRemainAllowedAndDeleteWithoutRecursion() {
        var f = fixture();
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
            }
            return rootId;
        });
        var page = comments.getCommentPage(f.ownerId, f.jarId, f.noteId, 0L, 30, null);
        assertThat(page.items()).hasSize(30);
        assertThat(page.items()).allSatisfy(item -> assertThat(item.replies()).isEmpty());
        assertThat(page.totalCount()).isEqualTo(1100);
        assertThat(page.hasMore()).isTrue();
        var next = comments.getCommentPage(f.ownerId, f.jarId, f.noteId, page.nextCursor(), 30, null);
        assertThat(next.items().get(0).commentId()).isGreaterThan(page.nextCursor());
        comments.deleteComment(f.ownerId, f.jarId, f.noteId, root);
        assertThat(commentRepository.countByNote_NoteId(f.noteId)).isZero();
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
}
