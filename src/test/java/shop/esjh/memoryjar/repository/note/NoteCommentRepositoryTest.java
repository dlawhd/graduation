package shop.esjh.memoryjar.repository.note;

import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.entity.note.NoteComment;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class NoteCommentRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private NoteCommentRepository noteCommentRepository;

    @Test
    @DisplayName("findByCommentId는 삭제되지 않은 댓글을 조회한다")
    void findByCommentId_returnsActiveComment() {
        User owner = saveUser("owner-comment-find", "owner-comment-find@example.com", "owner");
        Jar jar = saveJar(owner, "comment-find-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "comment-find-note", LocalDateTime.now());
        NoteComment comment = saveComment(note, owner, "첫 댓글");

        flushAndClear();

        assertThat(noteCommentRepository.findByCommentId(comment.getCommentId()))
                .isPresent()
                .get()
                .extracting(NoteComment::getContent)
                .isEqualTo("첫 댓글");
    }

    @Test
    @DisplayName("findByCommentId는 soft delete 된 댓글을 제외한다")
    void findByCommentId_excludesSoftDeletedComment() {
        User owner = saveUser("owner-comment-delete", "owner-comment-delete@example.com", "owner");
        Jar jar = saveJar(owner, "comment-delete-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "comment-delete-note", LocalDateTime.now());
        NoteComment comment = saveComment(note, owner, "삭제될 댓글");

        noteCommentRepository.delete(comment);
        flushAndClear();

        assertThat(noteCommentRepository.findByCommentId(comment.getCommentId())).isEmpty();
    }

    @Test
    @DisplayName("findByNote_NoteIdOrderByCreatedAtAscCommentIdAsc는 오래된 순서대로 댓글 목록을 반환한다")
    void findByNoteIdOrderByCreatedAtAscCommentIdAsc_returnsCommentsInAscendingOrder() {
        User owner = saveUser("owner-comment-list", "owner-comment-list@example.com", "owner");
        User commenter = saveUser("commenter-comment-list", "commenter-comment-list@example.com", "commenter");
        Jar jar = saveJar(owner, "comment-list-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "comment-list-note", LocalDateTime.now());
        saveComment(note, commenter, "첫 댓글");
        saveComment(note, owner, "둘째 댓글");

        flushAndClear();

        assertThat(noteCommentRepository.findByNote_NoteIdOrderByCreatedAtAscCommentIdAsc(note.getNoteId()))
                .extracting(NoteComment::getContent)
                .containsExactly("첫 댓글", "둘째 댓글");
    }

    @Test
    @DisplayName("findByCommentIdAndNote_NoteId는 해당 쪽지 범위의 댓글만 조회한다")
    void findByCommentIdAndNoteNoteId_returnsOnlyCommentWithinNote() {
        User owner = saveUser("owner-comment-scope", "owner-comment-scope@example.com", "owner");
        Jar jar = saveJar(owner, "comment-scope-jar", LocalDateTime.now().plusDays(1));
        Note firstNote = saveNote(jar, owner, "comment-scope-first-note", LocalDateTime.now());
        Note secondNote = saveNote(jar, owner, "comment-scope-second-note", LocalDateTime.now().plusMinutes(1));
        NoteComment comment = saveComment(firstNote, owner, "범위 댓글");

        flushAndClear();

        assertThat(noteCommentRepository.findByCommentIdAndNote_NoteId(comment.getCommentId(), firstNote.getNoteId()))
                .isPresent();
        assertThat(noteCommentRepository.findByCommentIdAndNote_NoteId(comment.getCommentId(), secondNote.getNoteId()))
                .isEmpty();
    }

    @Test
    @DisplayName("countByNote_NoteId는 해당 쪽지의 댓글 수를 센다")
    void countByNoteId_countsComments() {
        User owner = saveUser("owner-comment-count", "owner-comment-count@example.com", "owner");
        User commenter = saveUser("commenter-comment-count", "commenter-comment-count@example.com", "commenter");
        Jar jar = saveJar(owner, "comment-count-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "comment-count-note", LocalDateTime.now());
        saveComment(note, owner, "첫 댓글");
        saveComment(note, commenter, "둘째 댓글");

        flushAndClear();

        assertThat(noteCommentRepository.countByNote_NoteId(note.getNoteId())).isEqualTo(2L);
    }

    @Test
    @DisplayName("countByNote_NoteId는 soft delete 된 댓글을 제외한다")
    void countByNoteId_excludesSoftDeletedComments() {
        User owner = saveUser("owner-comment-count-delete", "owner-comment-count-delete@example.com", "owner");
        Jar jar = saveJar(owner, "comment-count-delete-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "comment-count-delete-note", LocalDateTime.now());
        NoteComment activeComment = saveComment(note, owner, "남는 댓글");
        NoteComment deletedComment = saveComment(note, owner, "삭제 댓글");

        noteCommentRepository.delete(deletedComment);
        flushAndClear();

        assertThat(noteCommentRepository.countByNote_NoteId(note.getNoteId())).isEqualTo(1L);
        assertThat(noteCommentRepository.findByCommentId(activeComment.getCommentId())).isPresent();
    }

    @Test
    @DisplayName("countCommentsByNoteIds는 여러 쪽지의 댓글 개수를 한 번에 조회한다")
    void countCommentsByNoteIds_returnsCommentCountsInBatch() {
        // given
        User owner = saveUser("owner-comment-batch", "owner-comment-batch@example.com", "owner");
        User commenter = saveUser("commenter-comment-batch", "commenter-comment-batch@example.com", "commenter");

        Jar jar = saveJar(owner, "comment-batch-jar", LocalDateTime.now().plusDays(1));

        Note firstNote = saveNote(jar, owner, "comment-batch-first-note", LocalDateTime.now());
        Note secondNote = saveNote(jar, owner, "comment-batch-second-note", LocalDateTime.now().plusMinutes(1));
        Note emptyNote = saveNote(jar, owner, "comment-batch-empty-note", LocalDateTime.now().plusMinutes(2));

        saveComment(firstNote, owner, "첫 번째 쪽지 댓글 1");
        saveComment(firstNote, commenter, "첫 번째 쪽지 댓글 2");
        saveComment(secondNote, commenter, "두 번째 쪽지 댓글 1");

        flushAndClear();

        // when
        List<NoteCommentRepository.CommentCountView> result = noteCommentRepository.countCommentsByNoteIds(
                List.of(firstNote.getNoteId(), secondNote.getNoteId(), emptyNote.getNoteId())
        );

        // then
        // 댓글이 있는 쪽지만 결과에 나온다.
        // 댓글이 0개인 emptyNote는 GROUP BY 결과에 나오지 않는다.
        assertThat(result)
                .extracting(NoteCommentRepository.CommentCountView::getNoteId)
                .containsExactlyInAnyOrder(firstNote.getNoteId(), secondNote.getNoteId());

        assertThat(result)
                .filteredOn(view -> view.getNoteId().equals(firstNote.getNoteId()))
                .singleElement()
                .extracting(NoteCommentRepository.CommentCountView::getCommentCount)
                .isEqualTo(2L);

        assertThat(result)
                .filteredOn(view -> view.getNoteId().equals(secondNote.getNoteId()))
                .singleElement()
                .extracting(NoteCommentRepository.CommentCountView::getCommentCount)
                .isEqualTo(1L);
    }

    private NoteComment saveComment(Note note, User user, String content) {
        return persist(NoteComment.builder()
                .note(note)
                .user(user)
                .content(content)
                .build());
    }
}
