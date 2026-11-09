package shop.esjh.memoryjar.service.file;
import java.time.*;import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.entity.*;import shop.esjh.memoryjar.entity.note.*;import shop.esjh.memoryjar.entity.jar.*;
import shop.esjh.memoryjar.entity.file.*;import shop.esjh.memoryjar.enums.file.*;
import shop.esjh.memoryjar.repository.note.*;import shop.esjh.memoryjar.repository.file.*;import shop.esjh.memoryjar.repository.jar.*;
import shop.esjh.memoryjar.service.jar.*;
import static org.assertj.core.api.Assertions.*;import static org.mockito.Mockito.*;
/** 직접 첨부 주소와 업로드 주소 양쪽에 동일한 비공개·강퇴 규칙이 적용되는지 확인한다. */
class FileReadAccessServiceTest {
 final NoteAttachmentRepository attachments=mock(NoteAttachmentRepository.class);
 final FileUploadRepository uploads=mock(FileUploadRepository.class);final JarMemberRepository members=mock(JarMemberRepository.class);
 final JarOpenService opening=mock(JarOpenService.class);final FileReadAccessService access=new FileReadAccessService(attachments,uploads,members,opening);
 final NoteAttachment attachment=mock(NoteAttachment.class);final Note note=mock(Note.class);final Jar jar=mock(Jar.class);
 @BeforeEach void fixture(){lenient().when(attachments.findForRead(1L)).thenReturn(Optional.of(attachment));lenient().when(attachment.getNote()).thenReturn(note);
  lenient().when(note.getJar()).thenReturn(jar);lenient().when(jar.getJarId()).thenReturn(10L);lenient().when(attachment.getS3Key()).thenReturn("notes/a.png");lenient().when(attachment.getContentType()).thenReturn("image/png");}
 void notFound(org.assertj.core.api.ThrowableAssert.ThrowingCallable call){assertThatThrownBy(call).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(404));}
 @Test void closedOtherNoteAndUnknownAttachmentReturnSameStatus(){when(members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L,2L)).thenReturn(true);notFound(()->access.attachment(2L,1L));notFound(()->access.attachment(2L,999L));}
 @Test void ownerCanReadClosedNoteAndMemberCanReadOpenedNote(){when(members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L,1L)).thenReturn(true);when(note.isAuthor(1L)).thenReturn(true);assertThat(access.attachment(1L,1L).key()).isEqualTo("notes/a.png");when(opening.isOpened(10L)).thenReturn(true);assertThat(access.attachment(1L,1L).contentType()).isEqualTo("image/png");}
 @Test void removedAuthorCannotBypassMembershipThroughUploadRoute(){var file=mock(FileUpload.class);var user=mock(User.class);when(uploads.findById(3L)).thenReturn(Optional.of(file));when(file.getUser()).thenReturn(user);when(user.getId()).thenReturn(1L);when(file.getStatus()).thenReturn(FileUploadStatus.CONSUMED);when(file.getS3Key()).thenReturn("notes/a.png");when(attachments.findHistoricalReference("notes/a.png")).thenReturn(Optional.of(1L));notFound(()->access.upload(1L,3L));}
 @Test void unboundFileIsOnlyReadableByOwnerBeforeRetentionEnds(){var file=mock(FileUpload.class);var user=mock(User.class);when(uploads.findById(3L)).thenReturn(Optional.of(file));when(file.getUser()).thenReturn(user);when(user.getId()).thenReturn(1L);when(file.getStatus()).thenReturn(FileUploadStatus.COMPLETED);when(file.getUnusedCleanupAfter()).thenReturn(LocalDateTime.now(ZoneId.of("Asia/Seoul")).plusDays(1));assertThatCode(()->access.upload(1L,3L)).doesNotThrowAnyException();notFound(()->access.upload(2L,3L));when(file.getUnusedCleanupAfter()).thenReturn(LocalDateTime.now().minusDays(2));notFound(()->access.upload(1L,3L));}
}
