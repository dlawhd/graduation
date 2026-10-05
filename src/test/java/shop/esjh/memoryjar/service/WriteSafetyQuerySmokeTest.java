package shop.esjh.memoryjar.service;

import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.jar.JarMember;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.entity.note.NoteComment;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiProvider;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarTheme;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.note.NoteCommentRepository;
import shop.esjh.memoryjar.service.note.NoteCommentService;
import shop.esjh.memoryjar.service.note.NoteRealtimeService;
import shop.esjh.memoryjar.service.notification.NotificationService;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Docker 없이 기존 H2 의존성으로 JPQL·평탄 페이지·soft delete·실패 예약 조회를 검증한다.
 * Hibernate 생성 스키마를 사용하므로 MariaDB 잠금 경쟁과 Flyway V48 검증을 대체하지 않는다.
 */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@Import({JpaAuditConfig.class, NoteCommentService.class})
class WriteSafetyQuerySmokeTest {
    @Autowired TestEntityManager entities;
    @Autowired NoteCommentRepository commentRepository;
    @Autowired JarAiGenerationRepository generationRepository;
    @Autowired NoteCommentService comments;
    @MockitoBean NotificationService notifications;
    @MockitoBean NoteRealtimeService realtime;

    @Test
    void actualQueriesKeepRootLinksAndHandle1100ReplyLevels() {
        var owner = owner();
        var jar = entities.persist(Jar.builder().owner(owner).name("쿼리 검증").theme(JarTheme.SPRING)
                .maxMembers(2).openAt(LocalDateTime.now().plusDays(1)).openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.TITLE_ONLY).build());
        entities.persist(JarMember.createOwner(jar, owner));
        var note = entities.persist(Note.builder().jar(jar).author(owner).title("시험").content("본문")
                .isEncrypted(false).tags(List.of()).build());
        NoteComment parent = null;
        Long root = null;
        for (int depth = 0; depth < 1100; depth++) {
            parent = entities.persist(NoteComment.builder().note(note).user(owner).content("답글")
                    .parentComment(parent).build());
            if (root == null) root = parent.getCommentId();
        }
        Long focus = parent.getCommentId();
        Long ownerId = owner.getId(), jarId = jar.getJarId(), noteId = note.getNoteId();
        entities.flush();
        entities.clear();

        var links = commentRepository.findCommentLinks(noteId);
        assertThat(links).hasSize(1100);
        assertThat(links).anySatisfy(link -> assertThat(link.getParentId()).isNull());
        var page = comments.getCommentPage(ownerId, jarId, noteId, 0L, 30, null);
        assertThat(page.items()).hasSize(30);
        assertThat(page.totalCount()).isEqualTo(1100);
        assertThat(page.hasMore()).isTrue();
        var focused = comments.getCommentPage(ownerId, jarId, noteId, 0L, 30, focus);
        assertThat(focused.items()).hasSize(1100).allSatisfy(item -> assertThat(item.replies()).isEmpty());
        assertThat(focused.nextCursor()).isEqualTo(page.nextCursor());

        comments.deleteComment(ownerId, jarId, noteId, root);
        entities.clear();
        assertThat(commentRepository.countByNote_NoteId(noteId)).isZero();
    }

    @Test
    void thirtyDifferentAuthorsAreReadWithoutPerCommentQueries() {
        var owner = owner();
        var jar = entities.persist(Jar.builder().owner(owner).name("작성자 조회 검증").theme(JarTheme.SPRING)
                .maxMembers(2).openAt(LocalDateTime.now().plusDays(1)).openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.TITLE_ONLY).build());
        entities.persist(JarMember.createOwner(jar, owner));
        var note = entities.persist(Note.builder().jar(jar).author(owner).title("시험").content("본문")
                .isEncrypted(false).tags(List.of()).build());
        for (int index = 0; index < 31; index++) {
            var author = entities.persist(User.builder().name("작성자 " + index).provider("NAVER")
                    .providerId("author-" + index).build());
            entities.persist(NoteComment.builder().note(note).user(author).content("답글").build());
        }
        Long ownerId = owner.getId(), jarId = jar.getJarId(), noteId = note.getNoteId();
        entities.flush();
        entities.clear();
        var statistics = entities.getEntityManager().getEntityManagerFactory()
                .unwrap(org.hibernate.SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        try {
            var page = comments.getCommentPage(ownerId, jarId, noteId, 0L, 30, null);
            assertThat(page.items()).hasSize(30).allSatisfy(item -> assertThat(item.authorName()).startsWith("작성자 "));
            // 사용자/저금통/멤버/쪽지/페이지/전체 수의 고정 조회 외에 작성자 30회 조회가 생기면 실패한다.
            assertThat(statistics.getPrepareStatementCount()).isLessThanOrEqualTo(8);
        } finally { statistics.setStatisticsEnabled(false); }
    }

    @Test
    void failureReservationSurvivesAndQueryExcludesSucceededOrCleanedFiles() {
        var now = LocalDateTime.of(2026, 10, 5, 12, 0);
        var draft = entities.persist(JarDesignDraft.builder().owner(owner()).originalS3Key("fixture/original")
                .expiresAt(now.plusDays(1)).build());
        var failed = generation(draft);
        failed.reserveCandidateUpload("fixture/failed");
        failed.markFailed(JarAiGenerationErrorCode.INTERNAL_ERROR, "시험 실패", now.minusHours(1));
        entities.persist(failed);
        var succeeded = generation(draft);
        succeeded.reserveCandidateUpload("fixture/succeeded");
        succeeded.markSucceeded("fixture/succeeded", now.minusHours(1));
        entities.persist(succeeded);
        entities.flush();
        entities.clear();

        var retry = generationRepository.findFailedCandidateCleanupReferences(now, PageRequest.of(0, 10));
        assertThat(retry).hasSize(1);
        assertThat(retry.get(0).getCandidateKey()).isEqualTo("fixture/failed");
        var saved = generationRepository.findById(failed.getGenerationId()).orElseThrow();
        assertThat(saved.getGeneratedS3Key()).isNull();
        assertThat(saved.getCandidateUploadS3Key()).isEqualTo("fixture/failed");
        saved.markFailedCandidateCleaned(now);
        entities.flush();
        assertThat(generationRepository.findFailedCandidateCleanupReferences(now, PageRequest.of(0, 10))).isEmpty();
    }

    private User owner() {
        return entities.persist(User.builder().name("시험 작성자").email("fixture@example.com")
                .provider("NAVER").providerId("fixture").birthyear("2000").build());
    }

    private JarAiGeneration generation(JarDesignDraft draft) {
        return JarAiGeneration.builder().draft(draft).aiStyle(JarAiStyle.CUTE_2D)
                .aiProvider(JarAiProvider.CLOUDFLARE).aiModel("fixture-model").promptVersion("fixture-v1").build();
    }
}
