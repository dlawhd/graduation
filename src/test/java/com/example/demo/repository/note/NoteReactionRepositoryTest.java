package com.example.demo.repository.note;

import com.example.demo.config.JpaAuditConfig;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.enums.note.NoteReactionEmoji;
import com.example.demo.repository.support.AbstractMariaDbRepositoryTest;
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
import static org.assertj.core.api.Assertions.tuple;

/**
 * NoteReactionRepository의 단건 조회, 집계 조회, 내 리액션 조회를 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class NoteReactionRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private NoteReactionRepository noteReactionRepository;

    @Test
    @DisplayName("findByNote_NoteIdAndUser_Id는 사용자의 리액션을 조회한다")
    void findByNoteIdAndUserId_returnsReaction() {
        User owner = saveUser("owner-reaction-find", "owner-reaction-find@example.com", "owner");
        User reactor = saveUser("reactor-find", "reactor-find@example.com", "reactor");
        Jar jar = saveJar(owner, "reaction-find-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "reaction-note", LocalDateTime.now());
        saveReaction(note, reactor, NoteReactionEmoji.LOVE);

        flushAndClear();

        assertThat(noteReactionRepository.findByNote_NoteIdAndUser_Id(note.getNoteId(), reactor.getId()))
                .isPresent()
                .get()
                .extracting(reaction -> reaction.getEmoji())
                .isEqualTo(NoteReactionEmoji.LOVE);
    }

    @Test
    @DisplayName("countByNote_NoteId는 쪽지의 전체 리액션 수를 센다")
    void countByNoteId_countsAllReactions() {
        User owner = saveUser("owner-reaction-count", "owner-reaction-count@example.com", "owner");
        User reactorOne = saveUser("reactor-count-1", "reactor-count-1@example.com", "reactor1");
        User reactorTwo = saveUser("reactor-count-2", "reactor-count-2@example.com", "reactor2");
        Jar jar = saveJar(owner, "reaction-count-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "count-note", LocalDateTime.now());
        saveReaction(note, reactorOne, NoteReactionEmoji.LOVE);
        saveReaction(note, reactorTwo, NoteReactionEmoji.SMILE);

        flushAndClear();

        assertThat(noteReactionRepository.countByNote_NoteId(note.getNoteId())).isEqualTo(2);
    }

    @Test
    @DisplayName("countGroupedByNoteIds는 noteId와 emoji별로 묶어서 집계한다")
    void countGroupedByNoteIds_groupsCountsByNoteAndEmoji() {
        User owner = saveUser("owner-reaction-group", "owner-reaction-group@example.com", "owner");
        User userOne = saveUser("reactor-group-1", "reactor-group-1@example.com", "reactor1");
        User userTwo = saveUser("reactor-group-2", "reactor-group-2@example.com", "reactor2");
        User userThree = saveUser("reactor-group-3", "reactor-group-3@example.com", "reactor3");
        Jar jar = saveJar(owner, "reaction-group-jar", LocalDateTime.now().plusDays(1));
        Note firstNote = saveNote(jar, owner, "first-group-note", LocalDateTime.now());
        Note secondNote = saveNote(jar, owner, "second-group-note", LocalDateTime.now());
        saveReaction(firstNote, userOne, NoteReactionEmoji.LOVE);
        saveReaction(firstNote, userTwo, NoteReactionEmoji.LOVE);
        saveReaction(secondNote, userThree, NoteReactionEmoji.CHEER);

        flushAndClear();

        assertThat(noteReactionRepository.countGroupedByNoteIds(List.of(firstNote.getNoteId(), secondNote.getNoteId())))
                .extracting(
                        NoteReactionRepository.ReactionCountView::getNoteId,
                        NoteReactionRepository.ReactionCountView::getEmoji,
                        NoteReactionRepository.ReactionCountView::getCount
                )
                .containsExactlyInAnyOrder(
                        tuple(firstNote.getNoteId(), NoteReactionEmoji.LOVE, 2L),
                        tuple(secondNote.getNoteId(), NoteReactionEmoji.CHEER, 1L)
                );
    }

    @Test
    @DisplayName("countGroupedByNoteId는 단일 쪽지의 emoji별 집계를 반환한다")
    void countGroupedByNoteId_groupsCountsForSingleNote() {
        User owner = saveUser("owner-reaction-single", "owner-reaction-single@example.com", "owner");
        User userOne = saveUser("reactor-single-1", "reactor-single-1@example.com", "reactor1");
        User userTwo = saveUser("reactor-single-2", "reactor-single-2@example.com", "reactor2");
        Jar jar = saveJar(owner, "reaction-single-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "single-group-note", LocalDateTime.now());
        saveReaction(note, userOne, NoteReactionEmoji.THANKFUL);
        saveReaction(note, userTwo, NoteReactionEmoji.THANKFUL);

        flushAndClear();

        assertThat(noteReactionRepository.countGroupedByNoteId(note.getNoteId()))
                .extracting(
                        NoteReactionRepository.ReactionCountView::getEmoji,
                        NoteReactionRepository.ReactionCountView::getCount
                )
                .containsExactly(tuple(NoteReactionEmoji.THANKFUL, 2L));
    }

    @Test
    @DisplayName("findMyReactionsByUserIdAndNoteIds는 여러 쪽지에 대한 내 리액션만 반환한다")
    void findMyReactionsByUserIdAndNoteIds_returnsOnlyMyReactions() {
        User owner = saveUser("owner-reaction-my", "owner-reaction-my@example.com", "owner");
        User me = saveUser("me-reaction-my", "me-reaction-my@example.com", "me");
        User other = saveUser("other-reaction-my", "other-reaction-my@example.com", "other");
        Jar jar = saveJar(owner, "reaction-my-jar", LocalDateTime.now().plusDays(1));
        Note firstNote = saveNote(jar, owner, "my-first-note", LocalDateTime.now());
        Note secondNote = saveNote(jar, owner, "my-second-note", LocalDateTime.now());
        saveReaction(firstNote, me, NoteReactionEmoji.LOVE);
        saveReaction(secondNote, me, NoteReactionEmoji.SMILE);
        saveReaction(secondNote, other, NoteReactionEmoji.CHEER);

        flushAndClear();

        assertThat(noteReactionRepository.findMyReactionsByUserIdAndNoteIds(
                me.getId(),
                List.of(firstNote.getNoteId(), secondNote.getNoteId())
        )).extracting(
                NoteReactionRepository.MyReactionView::getNoteId,
                NoteReactionRepository.MyReactionView::getEmoji
        ).containsExactlyInAnyOrder(
                tuple(firstNote.getNoteId(), NoteReactionEmoji.LOVE),
                tuple(secondNote.getNoteId(), NoteReactionEmoji.SMILE)
        );
    }
}
