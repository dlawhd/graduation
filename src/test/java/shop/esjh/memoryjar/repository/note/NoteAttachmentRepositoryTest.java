package shop.esjh.memoryjar.repository.note;

import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.entity.note.NoteAttachment;
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
import static org.assertj.core.api.Assertions.tuple;

/**
 * NoteAttachmentRepository의 정렬 조회, 마지막 첨부 조회, 개수 조회를 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class NoteAttachmentRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private NoteAttachmentRepository noteAttachmentRepository;

    @Test
    @DisplayName("findAllByNoteOrderBySortOrderAsc는 sortOrder 오름차순으로 반환한다")
    void findAllByNoteOrderBySortOrderAsc_returnsInSortOrder() {
        User owner = saveUser("owner-attachment-note", "owner-attachment-note@example.com", "owner");
        Jar jar = saveJar(owner, "attachment-note-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "attachment-note", LocalDateTime.now());
        saveAttachment(note, 2, "note/order-2.png");
        saveAttachment(note, 0, "note/order-0.png");
        saveAttachment(note, 1, "note/order-1.png");

        flushAndClear();

        assertThat(noteAttachmentRepository.findAllByNoteOrderBySortOrderAsc(note))
                .extracting(NoteAttachment::getSortOrder)
                .containsExactly(0, 1, 2);
    }

    @Test
    @DisplayName("findAllByNote_NoteIdOrderBySortOrderAsc는 noteId로도 같은 정렬 결과를 반환한다")
    void findAllByNoteIdOrderBySortOrderAsc_returnsInSortOrder() {
        User owner = saveUser("owner-attachment-noteid", "owner-attachment-noteid@example.com", "owner");
        Jar jar = saveJar(owner, "attachment-noteid-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "attachment-noteid", LocalDateTime.now());
        saveAttachment(note, 1, "noteid/order-1.png");
        saveAttachment(note, 0, "noteid/order-0.png");

        flushAndClear();

        assertThat(noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(note.getNoteId()))
                .extracting(NoteAttachment::getSortOrder)
                .containsExactly(0, 1);
    }

    @Test
    @DisplayName("findTopByNoteOrderBySortOrderDesc와 noteId 버전은 마지막 첨부를 조회한다")
    void findTopByNoteOrderBySortOrderDesc_returnsLastAttachment() {
        User owner = saveUser("owner-attachment-top", "owner-attachment-top@example.com", "owner");
        Jar jar = saveJar(owner, "attachment-top-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "attachment-top", LocalDateTime.now());
        saveAttachment(note, 0, "top/order-0.png");
        saveAttachment(note, 2, "top/order-2.png");
        saveAttachment(note, 1, "top/order-1.png");

        flushAndClear();

        assertThat(noteAttachmentRepository.findTopByNoteOrderBySortOrderDesc(note))
                .isPresent()
                .get()
                .extracting(NoteAttachment::getSortOrder)
                .isEqualTo(2);
        assertThat(noteAttachmentRepository.findTopByNote_NoteIdOrderBySortOrderDesc(note.getNoteId()))
                .isPresent()
                .get()
                .extracting(NoteAttachment::getSortOrder)
                .isEqualTo(2);
    }

    @Test
    @DisplayName("findAllByNote_NoteIdInOrderByNote_NoteIdAscSortOrderAsc는 noteId와 sortOrder 기준으로 정렬한다")
    void findAllByNoteIdInOrderByNoteIdAscSortOrderAsc_returnsSortedAttachments() {
        User owner = saveUser("owner-attachment-in", "owner-attachment-in@example.com", "owner");
        Jar jar = saveJar(owner, "attachment-in-jar", LocalDateTime.now().plusDays(1));
        Note firstNote = saveNote(jar, owner, "attachment-first", LocalDateTime.now());
        Note secondNote = saveNote(jar, owner, "attachment-second", LocalDateTime.now());
        saveAttachment(secondNote, 1, "second/order-1.png");
        saveAttachment(firstNote, 1, "first/order-1.png");
        saveAttachment(firstNote, 0, "first/order-0.png");
        saveAttachment(secondNote, 0, "second/order-0.png");

        flushAndClear();

        assertThat(noteAttachmentRepository.findAllByNote_NoteIdInOrderByNote_NoteIdAscSortOrderAsc(
                List.of(secondNote.getNoteId(), firstNote.getNoteId())
        )).extracting(
                attachment -> attachment.getNote().getNoteId(),
                NoteAttachment::getSortOrder
        ).containsExactly(
                tuple(firstNote.getNoteId(), 0),
                tuple(firstNote.getNoteId(), 1),
                tuple(secondNote.getNoteId(), 0),
                tuple(secondNote.getNoteId(), 1)
        );
    }

    @Test
    @DisplayName("existsByS3Key, findByS3Key, count 계열 메서드는 첨부 기본 조회를 지원한다")
    void attachmentLookupMethods_supportLookupAndCount() {
        User owner = saveUser("owner-attachment-lookup", "owner-attachment-lookup@example.com", "owner");
        Jar jar = saveJar(owner, "attachment-lookup-jar", LocalDateTime.now().plusDays(1));
        Note note = saveNote(jar, owner, "attachment-lookup", LocalDateTime.now());
        saveAttachment(note, 0, "lookup/file-0.png");
        saveAttachment(note, 1, "lookup/file-1.png");

        flushAndClear();

        assertThat(noteAttachmentRepository.existsByS3Key("lookup/file-1.png")).isTrue();
        assertThat(noteAttachmentRepository.findByS3Key("lookup/file-1.png")).isPresent();
        assertThat(noteAttachmentRepository.countByNote(note)).isEqualTo(2);
        assertThat(noteAttachmentRepository.countByNote_NoteId(note.getNoteId())).isEqualTo(2);
    }
}
