package com.example.demo.service;

import com.example.demo.dto.note.request.NoteAttachmentCreateRequest;
import com.example.demo.dto.note.request.NoteAttachmentSortUpdateRequest;
import com.example.demo.entity.note.Note;
import com.example.demo.entity.note.NoteAttachment;
import com.example.demo.repository.note.NoteAttachmentRepository;
import com.example.demo.repository.note.NoteRepository;
import com.example.demo.service.note.NoteAttachmentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NoteAttachmentServiceTest {

    @Mock
    private NoteRepository noteRepository;

    @Mock
    private NoteAttachmentRepository noteAttachmentRepository;

    @InjectMocks
    private NoteAttachmentService noteAttachmentService;

    private Note note;

    @BeforeEach
    void setUp() {
        note = mock(Note.class);
    }

    @Test
    @DisplayName("첨부파일 1개 저장 성공 - 다음 sortOrder를 계산해서 저장한다")
    void createAttachment_success() {
        // given
        Long noteId = 1L;

        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));
        when(noteAttachmentRepository.existsByS3Key("notes/1/file1.png")).thenReturn(false);
        when(noteAttachmentRepository.countByNote_NoteId(noteId)).thenReturn(2L);

        NoteAttachment lastAttachment = mock(NoteAttachment.class);
        when(lastAttachment.getSortOrder()).thenReturn(1);
        when(noteAttachmentRepository.findTopByNote_NoteIdOrderBySortOrderDesc(noteId))
                .thenReturn(Optional.of(lastAttachment));

        // save()에 들어가는 실제 엔티티를 꺼내서 값 검증할 거야
        when(noteAttachmentRepository.save(any(NoteAttachment.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // when
        NoteAttachment result = noteAttachmentService.createAttachment(
                noteId,
                "notes/1/file1.png",
                "https://cdn.test.com/file1.png",
                "https://cdn.test.com/thumb1.png",
                "image/png",
                1024L
        );

        // then
        ArgumentCaptor<NoteAttachment> captor = ArgumentCaptor.forClass(NoteAttachment.class);
        verify(noteAttachmentRepository).save(captor.capture());

        NoteAttachment savedAttachment = captor.getValue();

        assertThat(result).isNotNull();
        assertThat(savedAttachment.getNote()).isEqualTo(note);
        assertThat(savedAttachment.getSortOrder()).isEqualTo(2);
        assertThat(savedAttachment.getS3Key()).isEqualTo("notes/1/file1.png");
        assertThat(savedAttachment.getUrl()).isEqualTo("https://cdn.test.com/file1.png");
        assertThat(savedAttachment.getThumbnailUrl()).isEqualTo("https://cdn.test.com/thumb1.png");
        assertThat(savedAttachment.getContentType()).isEqualTo("image/png");
        assertThat(savedAttachment.getSize()).isEqualTo(1024L);
    }

    @Test
    @DisplayName("첨부파일 1개 저장 실패 - 쪽지가 없으면 404")
    void createAttachment_fail_noteNotFound() {
        // given
        Long noteId = 999L;
        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.createAttachment(
                noteId,
                "notes/999/file.png",
                "https://cdn.test.com/file.png",
                null,
                "image/png",
                100L
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(exception.getReason()).isEqualTo("쪽지를 찾을 수 없어.");
                });

        verify(noteAttachmentRepository, never()).save(any());
    }

    @Test
    @DisplayName("첨부파일 1개 저장 실패 - s3Key가 중복이면 409")
    void createAttachment_fail_duplicateS3Key() {
        // given
        Long noteId = 1L;
        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));
        when(noteAttachmentRepository.existsByS3Key("notes/1/file1.png")).thenReturn(true);

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.createAttachment(
                noteId,
                "notes/1/file1.png",
                "https://cdn.test.com/file1.png",
                null,
                "image/png",
                100L
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getReason()).isEqualTo("이미 저장된 첨부파일이야.");
                });

        verify(noteAttachmentRepository, never()).save(any());
    }

    @Test
    @DisplayName("첨부파일 1개 저장 실패 - 첨부 개수 제한 초과면 400")
    void createAttachment_fail_attachmentLimitExceeded() {
        // given
        Long noteId = 1L;
        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));
        when(noteAttachmentRepository.existsByS3Key("notes/1/file1.png")).thenReturn(false);
        when(noteAttachmentRepository.countByNote_NoteId(noteId)).thenReturn(10L);

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.createAttachment(
                noteId,
                "notes/1/file1.png",
                "https://cdn.test.com/file1.png",
                null,
                "image/png",
                100L
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).contains("최대 10개");
                });

        verify(noteAttachmentRepository, never()).save(any());
    }

    @Test
    @DisplayName("첨부파일 여러 개 저장 성공 - sortOrder를 순서대로 붙인다")
    void createAttachments_success() {
        // given
        Long noteId = 1L;

        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));
        when(noteAttachmentRepository.countByNote_NoteId(noteId)).thenReturn(2L);

        NoteAttachment lastAttachment = mock(NoteAttachment.class);
        when(lastAttachment.getSortOrder()).thenReturn(1);
        when(noteAttachmentRepository.findTopByNote_NoteIdOrderBySortOrderDesc(noteId))
                .thenReturn(Optional.of(lastAttachment));

        when(noteAttachmentRepository.existsByS3Key("notes/1/file2.png")).thenReturn(false);
        when(noteAttachmentRepository.existsByS3Key("notes/1/file3.png")).thenReturn(false);

        when(noteAttachmentRepository.saveAll(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        List<NoteAttachmentCreateRequest> requests = List.of(
                new NoteAttachmentCreateRequest(
                        "notes/1/file2.png",
                        "https://cdn.test.com/file2.png",
                        null,
                        "image/png",
                        200L
                ),
                new NoteAttachmentCreateRequest(
                        "notes/1/file3.png",
                        "https://cdn.test.com/file3.png",
                        "https://cdn.test.com/thumb3.png",
                        "image/png",
                        300L
                )
        );

        // when
        List<NoteAttachment> result = noteAttachmentService.createAttachments(noteId, requests);

        // then
        ArgumentCaptor<List<NoteAttachment>> captor = ArgumentCaptor.forClass(List.class);
        verify(noteAttachmentRepository).saveAll(captor.capture());

        List<NoteAttachment> savedAttachments = captor.getValue();

        assertThat(result).hasSize(2);
        assertThat(savedAttachments).hasSize(2);

        assertThat(savedAttachments.get(0).getSortOrder()).isEqualTo(2);
        assertThat(savedAttachments.get(0).getS3Key()).isEqualTo("notes/1/file2.png");

        assertThat(savedAttachments.get(1).getSortOrder()).isEqualTo(3);
        assertThat(savedAttachments.get(1).getS3Key()).isEqualTo("notes/1/file3.png");
        assertThat(savedAttachments.get(1).getThumbnailUrl()).isEqualTo("https://cdn.test.com/thumb3.png");
        assertThat(savedAttachments.get(0).getNote()).isEqualTo(note);
        assertThat(savedAttachments.get(1).getNote()).isEqualTo(note);
    }

    @Test
    @DisplayName("첨부파일 여러 개 저장 - 요청이 비어 있으면 빈 리스트 반환")
    void createAttachments_emptyRequest_returnsEmptyList() {
        // when
        List<NoteAttachment> result = noteAttachmentService.createAttachments(1L, null);

        // then
        assertThat(result).isEmpty();
        verify(noteRepository, never()).findByNoteId(any());
        verify(noteAttachmentRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("첨부파일 목록 조회 성공 - note의 첨부를 sortOrder 순서대로 반환한다")
    void getAttachments_success() {
        // given
        Long noteId = 1L;
        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));

        NoteAttachment a1 = mock(NoteAttachment.class);
        NoteAttachment a2 = mock(NoteAttachment.class);

        List<NoteAttachment> attachments = List.of(a1, a2);

        when(noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(noteId))
                .thenReturn(attachments);

        // when
        List<NoteAttachment> result = noteAttachmentService.getAttachments(noteId);

        // then
        assertThat(result).hasSize(2);
        assertThat(result).containsExactly(a1, a2);
    }

    @Test
    @DisplayName("썸네일 주소 수정 성공")
    void updateThumbnailUrl_success() {
        // given
        Long attachmentId = 10L;

        NoteAttachment attachment = NoteAttachment.builder()
                .note(note)
                .sortOrder(0)
                .s3Key("notes/1/file1.png")
                .url("https://cdn.test.com/file1.png")
                .thumbnailUrl(null)
                .contentType("image/png")
                .size(123L)
                .build();

        ReflectionTestUtils.setField(attachment, "id", attachmentId);

        when(noteAttachmentRepository.findById(attachmentId)).thenReturn(Optional.of(attachment));

        // when
        NoteAttachment result = noteAttachmentService.updateThumbnailUrl(
                attachmentId,
                "https://cdn.test.com/thumb1.png"
        );

        // then
        assertThat(result.getThumbnailUrl()).isEqualTo("https://cdn.test.com/thumb1.png");
    }

    @Test
    @DisplayName("썸네일 주소 수정 실패 - 첨부파일이 없으면 404")
    void updateThumbnailUrl_fail_attachmentNotFound() {
        // given
        Long attachmentId = 999L;
        when(noteAttachmentRepository.findById(attachmentId)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.updateThumbnailUrl(
                attachmentId,
                "https://cdn.test.com/thumb.png"
        ))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(exception.getReason()).isEqualTo("첨부파일을 찾을 수 없어.");
                });
    }

    @Test
    @DisplayName("첨부파일 순서 재정렬 성공")
    void updateSortOrders_success() {
        // given
        Long noteId = 1L;
        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));

        NoteAttachment attachment1 = createAttachmentEntity(100L, 0, "notes/1/file1.png");
        NoteAttachment attachment2 = createAttachmentEntity(101L, 1, "notes/1/file2.png");
        NoteAttachment attachment3 = createAttachmentEntity(102L, 2, "notes/1/file3.png");

        when(noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(noteId))
                .thenReturn(List.of(attachment1, attachment2, attachment3));

        List<NoteAttachmentSortUpdateRequest> requests = List.of(
                new NoteAttachmentSortUpdateRequest(102L, 0),
                new NoteAttachmentSortUpdateRequest(100L, 1),
                new NoteAttachmentSortUpdateRequest(101L, 2)
        );

        // when
        noteAttachmentService.updateSortOrders(noteId, requests);

        // then
        assertThat(attachment3.getSortOrder()).isEqualTo(0);
        assertThat(attachment1.getSortOrder()).isEqualTo(1);
        assertThat(attachment2.getSortOrder()).isEqualTo(2);
    }

    @Test
    @DisplayName("첨부파일 순서 재정렬 실패 - sortOrder가 중복되면 400")
    void updateSortOrders_fail_duplicateSortOrder() {
        // given
        Long noteId = 1L;

        List<NoteAttachmentSortUpdateRequest> requests = List.of(
                new NoteAttachmentSortUpdateRequest(100L, 0),
                new NoteAttachmentSortUpdateRequest(101L, 0)
        );

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.updateSortOrders(noteId, requests))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).isEqualTo("중복된 sortOrder가 있어.");
                });

        // sortOrder 중복이면 그 뒤 단계까지 가지 않는 게 좋아
        verify(noteRepository, never()).findByNoteId(any());
    }

    @Test
    @DisplayName("첨부파일 순서 재정렬 실패 - 요청 개수와 실제 첨부 개수가 다르면 400")
    void updateSortOrders_fail_sizeMismatch() {
        // given
        Long noteId = 1L;
        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));

        NoteAttachment attachment1 = createAttachmentEntity(100L, 0, "notes/1/file1.png");
        NoteAttachment attachment2 = createAttachmentEntity(101L, 1, "notes/1/file2.png");

        when(noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(noteId))
                .thenReturn(List.of(attachment1, attachment2));

        List<NoteAttachmentSortUpdateRequest> requests = List.of(
                new NoteAttachmentSortUpdateRequest(100L, 0)
        );

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.updateSortOrders(noteId, requests))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).isEqualTo("첨부파일 순서 정보가 올바르지 않아.");
                });
    }

    @Test
    @DisplayName("첨부파일 순서 재정렬 실패 - 현재 note에 없는 첨부파일이 들어오면 400")
    void updateSortOrders_fail_attachmentNotBelongToNote() {
        // given
        Long noteId = 1L;
        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));

        NoteAttachment attachment1 = createAttachmentEntity(100L, 0, "notes/1/file1.png");
        NoteAttachment attachment2 = createAttachmentEntity(101L, 1, "notes/1/file2.png");

        when(noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(noteId))
                .thenReturn(List.of(attachment1, attachment2));

        List<NoteAttachmentSortUpdateRequest> requests = List.of(
                new NoteAttachmentSortUpdateRequest(100L, 0),
                new NoteAttachmentSortUpdateRequest(999L, 1)
        );

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.updateSortOrders(noteId, requests))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).isEqualTo("현재 쪽지에 없는 첨부파일이 포함되어 있어.");
                });
    }

    @Test
    @DisplayName("첨부파일 여러 개 저장 실패 - 요청 안에 같은 s3Key가 있으면 400")
    void createAttachments_fail_duplicateS3KeyInRequest() {
        Long noteId = 1L;

        List<NoteAttachmentCreateRequest> requests = List.of(
                new NoteAttachmentCreateRequest(
                        "notes/1/file2.png",
                        "https://cdn.test.com/file2.png",
                        null,
                        "image/png",
                        200L
                ),
                new NoteAttachmentCreateRequest(
                        "notes/1/file2.png",
                        "https://cdn.test.com/file2-dup.png",
                        null,
                        "image/png",
                        300L
                )
        );

        assertThatThrownBy(() -> noteAttachmentService.createAttachments(noteId, requests))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).isEqualTo("요청 안에 중복된 s3Key가 있어.");
                });

        verify(noteRepository, never()).findByNoteId(any());
        verify(noteAttachmentRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("여러 noteId의 첨부파일을 한 번에 조회한다")
    void getAttachmentsByNoteIds_success() {
        List<Long> noteIds = List.of(1L, 2L);

        NoteAttachment a1 = mock(NoteAttachment.class);
        NoteAttachment a2 = mock(NoteAttachment.class);

        when(noteAttachmentRepository.findAllByNote_NoteIdInOrderByNote_NoteIdAscSortOrderAsc(noteIds))
                .thenReturn(List.of(a1, a2));

        List<NoteAttachment> result = noteAttachmentService.getAttachmentsByNoteIds(noteIds);

        assertThat(result).containsExactly(a1, a2);
    }

    @Test
    @DisplayName("여러 noteId 조회 - 요청이 비어 있으면 빈 리스트 반환")
    void getAttachmentsByNoteIds_emptyRequest_returnsEmptyList() {
        List<NoteAttachment> result = noteAttachmentService.getAttachmentsByNoteIds(List.of());

        assertThat(result).isEmpty();
        verify(noteAttachmentRepository, never())
                .findAllByNote_NoteIdInOrderByNote_NoteIdAscSortOrderAsc(anyList());
    }

    private NoteAttachment createAttachmentEntity(Long id, Integer sortOrder, String s3Key) {
        NoteAttachment attachment = NoteAttachment.builder()
                .note(note)
                .sortOrder(sortOrder)
                .s3Key(s3Key)
                .url("https://cdn.test.com/" + id + ".png")
                .thumbnailUrl(null)
                .contentType("image/png")
                .size(100L)
                .build();

        ReflectionTestUtils.setField(attachment, "id", id);
        return attachment;
    }
}