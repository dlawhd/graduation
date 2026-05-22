package shop.esjh.memoryjar.service.note;

import shop.esjh.memoryjar.dto.note.request.NoteAttachmentCreateRequest;
import shop.esjh.memoryjar.dto.note.request.NoteAttachmentSortUpdateRequest;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.entity.note.NoteAttachment;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import shop.esjh.memoryjar.repository.note.NoteAttachmentRepository;
import shop.esjh.memoryjar.repository.note.NoteRepository;
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
import shop.esjh.memoryjar.entity.file.FileUpload;

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

    @Mock
    private FileUploadRepository fileUploadRepository;

    @InjectMocks
    private NoteAttachmentService noteAttachmentService;

    private Note note;

    @BeforeEach
    void setUp() {
        note = mock(Note.class);
    }

    @Test
    @DisplayName("첨부파일 여러 개 저장 성공 - sortOrder를 순서대로 붙인다")
    void createAttachments_success() {
        // given
        Long currentUserId = 1L;
        Long noteId = 1L;

        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));
        when(noteAttachmentRepository.countByNote_NoteId(noteId)).thenReturn(2L);

        NoteAttachment lastAttachment = mock(NoteAttachment.class);
        when(lastAttachment.getSortOrder()).thenReturn(1);
        when(noteAttachmentRepository.findTopByNote_NoteIdOrderBySortOrderDesc(noteId))
                .thenReturn(Optional.of(lastAttachment));

        when(noteAttachmentRepository.existsByS3Key("notes/1/file2.png")).thenReturn(false);
        when(noteAttachmentRepository.existsByS3Key("notes/1/file3.png")).thenReturn(false);

        // 현재 서비스는 file_uploads에서 실제 파일 정보를 가져오니까
        // FileUpload mock도 만들어줘야 해
        FileUpload upload1 = mock(FileUpload.class);
        when(upload1.getS3Key()).thenReturn("notes/1/file2.png");
        when(upload1.getPublicUrl()).thenReturn("https://cdn.test.com/file2.png");
        when(upload1.getContentType()).thenReturn("image/png");
        when(upload1.getSize()).thenReturn(200L);

        FileUpload upload2 = mock(FileUpload.class);
        when(upload2.getS3Key()).thenReturn("notes/1/file3.png");
        when(upload2.getPublicUrl()).thenReturn("https://cdn.test.com/file3.png");
        when(upload2.getContentType()).thenReturn("image/png");
        when(upload2.getSize()).thenReturn(300L);

        when(fileUploadRepository.findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(
                currentUserId,
                FilePurpose.NOTE,
                FileUploadStatus.COMPLETED,
                List.of("notes/1/file2.png", "notes/1/file3.png")
        )).thenReturn(List.of(upload1, upload2));

        when(noteAttachmentRepository.saveAll(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        List<NoteAttachmentCreateRequest> requests = List.of(
                new NoteAttachmentCreateRequest("notes/1/file2.png"),
                new NoteAttachmentCreateRequest("notes/1/file3.png")
        );

        // when
        List<NoteAttachment> result =
                noteAttachmentService.createAttachments(currentUserId, noteId, requests);

        // then
        ArgumentCaptor<List<NoteAttachment>> captor = ArgumentCaptor.forClass(List.class);
        verify(noteAttachmentRepository).saveAll(captor.capture());

        List<NoteAttachment> savedAttachments = captor.getValue();

        assertThat(result).hasSize(2);
        assertThat(savedAttachments).hasSize(2);

        // 기존 마지막 sortOrder가 1이었으니까 다음은 2부터 시작
        assertThat(savedAttachments.get(0).getSortOrder()).isEqualTo(2);
        assertThat(savedAttachments.get(0).getS3Key()).isEqualTo("notes/1/file2.png");

        assertThat(savedAttachments.get(1).getSortOrder()).isEqualTo(3);
        assertThat(savedAttachments.get(1).getS3Key()).isEqualTo("notes/1/file3.png");

        // 현재 서비스는 thumbnailUrl을 null로 저장하고 있어
        assertThat(savedAttachments.get(0).getUrl()).isEqualTo("https://cdn.test.com/file2.png");
        assertThat(savedAttachments.get(1).getUrl()).isEqualTo("https://cdn.test.com/file3.png");
        assertThat(savedAttachments.get(1).getThumbnailUrl()).isNull();

        assertThat(savedAttachments.get(0).getNote()).isEqualTo(note);
        assertThat(savedAttachments.get(1).getNote()).isEqualTo(note);

        verify(upload1).markConsumed();
        verify(upload2).markConsumed();
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

    @Test
    @DisplayName("첨부파일 여러 개 저장 실패 - complete 안 된 s3Key는 note에 연결할 수 없다")
    void createAttachments_fail_notCompletedUpload() {
        // given
        Long currentUserId = 1L;
        Long noteId = 1L;

        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));
        when(noteAttachmentRepository.countByNote_NoteId(noteId)).thenReturn(0L);

        List<NoteAttachmentCreateRequest> requests = List.of(
                new NoteAttachmentCreateRequest(
                        "notes/1/file1.png"
                )
        );

        // 현재 서비스는 "내 파일 + NOTE + COMPLETED"만 조회하므로,
        // complete 안 된 파일은 조회 결과에서 빠져서 empty list가 됨
        when(fileUploadRepository.findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(
                currentUserId,
                FilePurpose.NOTE,
                FileUploadStatus.COMPLETED,
                List.of("notes/1/file1.png")
        )).thenReturn(List.of());

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.createAttachments(currentUserId, noteId, requests))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).isEqualTo("complete가 끝난 내 NOTE 첨부만 연결할 수 있어.");
                });

        verify(noteAttachmentRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("첨부파일 여러 개 저장 실패 - 다른 사용자 업로드는 note에 연결할 수 없다")
    void createAttachments_fail_otherUsersUpload() {
        // given
        Long currentUserId = 1L;
        Long noteId = 1L;

        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));
        when(noteAttachmentRepository.countByNote_NoteId(noteId)).thenReturn(0L);

        List<NoteAttachmentCreateRequest> requests = List.of(
                new NoteAttachmentCreateRequest(
                        "notes/1/file2.png"
                )
        );

        // 현재 서비스는 "현재 사용자" 조건으로만 조회하므로
        // 다른 사람이 올린 파일도 조회 결과에서 빠져서 empty list가 됨
        when(fileUploadRepository.findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(
                currentUserId,
                FilePurpose.NOTE,
                FileUploadStatus.COMPLETED,
                List.of("notes/1/file2.png")
        )).thenReturn(List.of());

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.createAttachments(currentUserId, noteId, requests))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).isEqualTo("complete가 끝난 내 NOTE 첨부만 연결할 수 있어.");
                });

        verify(noteAttachmentRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("첨부파일 여러 개 저장 실패 - 이미 CONSUMED 된 업로드는 다시 note에 연결할 수 없다")
    void createAttachments_fail_consumedUpload() {
        // given
        Long currentUserId = 1L;
        Long noteId = 1L;

        when(noteRepository.findByNoteId(noteId)).thenReturn(Optional.of(note));
        when(noteAttachmentRepository.countByNote_NoteId(noteId)).thenReturn(0L);

        List<NoteAttachmentCreateRequest> requests = List.of(
                new NoteAttachmentCreateRequest(
                        "notes/1/file3.png"
                )
        );

        // 현재 서비스는 COMPLETED만 조회하므로
        // CONSUMED 상태 파일은 조회 결과에 안 들어옴
        when(fileUploadRepository.findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(
                currentUserId,
                FilePurpose.NOTE,
                FileUploadStatus.COMPLETED,
                List.of("notes/1/file3.png")
        )).thenReturn(List.of());

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.createAttachments(currentUserId, noteId, requests))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).isEqualTo("complete가 끝난 내 NOTE 첨부만 연결할 수 있어.");
                });

        verify(noteAttachmentRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("첨부파일 여러 개 저장 실패 - 같은 s3Key를 한 요청에 두 번 보내면 실패")
    void createAttachments_fail_duplicateS3KeyInRequest() {
        // given
        Long currentUserId = 1L;
        Long noteId = 1L;

        List<NoteAttachmentCreateRequest> requests = List.of(
                new NoteAttachmentCreateRequest(
                        "notes/1/file2.png"
                ),
                new NoteAttachmentCreateRequest(
                        "notes/1/file2.png"
                )
        );

        // when / then
        assertThatThrownBy(() -> noteAttachmentService.createAttachments(currentUserId, noteId, requests))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException exception = (ResponseStatusException) ex;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).isEqualTo("같은 첨부 파일을 중복으로 보낼 수 없어.");
                });

        // 중복이면 아예 note 조회까지 가지 않는 게 맞아
        verify(noteRepository, never()).findByNoteId(any());
        verify(noteAttachmentRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("첨부파일 여러 개 저장 - 요청이 비어 있으면 빈 리스트 반환")
    void createAttachments_emptyRequest_returnsEmptyList() {
        // when
        List<NoteAttachment> result = noteAttachmentService.createAttachments(1L, 1L, List.of());

        // then
        assertThat(result).isEmpty();
        verify(noteRepository, never()).findByNoteId(any());
        verify(noteAttachmentRepository, never()).saveAll(anyList());
    }

    // 이 함수는 FileUpload mock을 쉽게 만드는 작은 도우미야.
// 성공 케이스에서 repository가 돌려주는 업로드 기록을 흉내 낼 때 사용해.
    private FileUpload createUploadMock(
            String s3Key,
            String publicUrl,
            String contentType,
            Long size
    ) {
        FileUpload upload = mock(FileUpload.class);

        when(upload.getS3Key()).thenReturn(s3Key);
        when(upload.getPublicUrl()).thenReturn(publicUrl);
        when(upload.getContentType()).thenReturn(contentType);
        when(upload.getSize()).thenReturn(size);

        return upload;
    }
}