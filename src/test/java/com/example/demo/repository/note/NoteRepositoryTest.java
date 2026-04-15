package com.example.demo.repository.note;

import com.example.demo.config.JpaAuditConfig;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.repository.support.AbstractMariaDbRepositoryTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * NoteRepository의 soft delete, jar 범위 조회, 정렬 조건을 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class NoteRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private NoteRepository noteRepository;

    @Test
    @DisplayName("findByNoteId는 삭제되지 않은 쪽지를 조회한다")
    void findByNoteId_returnsActiveNote() {
        User owner = saveUser("owner-note-find", "owner-note-find@example.com", "owner");
        Jar jar = saveJar(owner, "note-find-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "first-note", LocalDateTime.now());

        flushAndClear();

        assertThat(noteRepository.findByNoteId(note.getNoteId())).isPresent();
    }

    @Test
    @DisplayName("findByNoteId는 soft delete 된 쪽지를 제외한다")
    void findByNoteId_excludesSoftDeletedNote() {
        User owner = saveUser("owner-note-delete", "owner-note-delete@example.com", "owner");
        Jar jar = saveJar(owner, "note-delete-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "deleted-note", LocalDateTime.now());

        noteRepository.delete(note);
        flushAndClear();

        assertThat(noteRepository.findByNoteId(note.getNoteId())).isEmpty();
    }

    @Test
    @DisplayName("findByJarId는 createdAt 내림차순으로 쪽지 목록을 반환한다")
    void findByJarId_returnsNotesInCreatedAtDescOrder() {
        User owner = saveUser("owner-note-list", "owner-note-list@example.com", "owner");
        Jar jar = saveJar(owner, "note-list-jar", LocalDateTime.now().plusDays(1));
        saveNote(jar, owner, "older-note", LocalDateTime.now().minusDays(1));
        saveNote(jar, owner, "newer-note", LocalDateTime.now());

        flushAndClear();

        Page<Note> result = noteRepository.findByJarId(jar.getJarId(), PageRequest.of(0, 10));

        assertThat(result.getContent()).extracting(Note::getTitle)
                .containsExactly("newer-note", "older-note");
    }

    @Test
    @DisplayName("findByJarIdAndNoteId는 jar 범위가 맞는 쪽지만 반환한다")
    void findByJarIdAndNoteId_returnsOnlyNoteWithinJar() {
        User owner = saveUser("owner-note-scope", "owner-note-scope@example.com", "owner");
        Jar jar = saveJar(owner, "note-scope-jar", LocalDateTime.now().plusDays(1));
        Jar otherJar = saveJar(owner, "other-note-scope-jar", LocalDateTime.now().plusDays(2));
        Note note = saveNote(jar, owner, "scope-note", LocalDateTime.now());

        flushAndClear();

        assertThat(noteRepository.findByJarIdAndNoteId(jar.getJarId(), note.getNoteId())).isPresent();
        assertThat(noteRepository.findByJarIdAndNoteId(otherJar.getJarId(), note.getNoteId())).isEmpty();
    }
}
