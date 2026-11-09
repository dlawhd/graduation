package shop.esjh.memoryjar.service.file;
import java.time.*;import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import shop.esjh.memoryjar.service.jar.JarOpenService;
import shop.esjh.memoryjar.entity.jar.JarMember;import shop.esjh.memoryjar.entity.note.NoteAttachment;
import shop.esjh.memoryjar.enums.jar.JarRole;import shop.esjh.memoryjar.enums.file.*;
import static org.assertj.core.api.Assertions.*;import static org.mockito.Mockito.*;
/** 실제 DB의 멤버 탈퇴·삭제·과거 COMPLETED 참조가 보호 경로를 우회하지 못하는지 확인한다. */
@DataJpaTest(showSql=false)
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class,FileReadAccessService.class})
class FileReadAccessIntegrationTest extends AbstractMariaDbRepositoryTest {
 @Autowired FileReadAccessService access;@MockitoBean JarOpenService opening;
 record Fixture(Long owner,Long viewer,Long upload,NoteAttachment attachment,JarMember membership){}
 Fixture fixture(){String id=UUID.randomUUID().toString();var owner=saveUser(id,id+"@example.invalid","작성자");var viewer=saveUser(id+"-other",id+"-other@example.invalid","멤버");
  var jar=saveJar(owner,"비공개",LocalDateTime.now().plusDays(1));var membership=saveJarMember(jar,owner,JarRole.OWNER,LocalDateTime.now());saveJarMember(jar,viewer,JarRole.MEMBER,LocalDateTime.now());
  var note=saveNote(jar,owner,"본인 쪽지",LocalDateTime.now());var upload=saveFileUpload(owner,FilePurpose.NOTE,FileUploadStatus.COMPLETED,"notes/"+id+".png");var attachment=saveAttachment(note,0,upload.getS3Key());
  return new Fixture(owner.getId(),viewer.getId(),upload.getId(),attachment,membership);}
 void denied(org.assertj.core.api.ThrowableAssert.ThrowingCallable call){assertThatThrownBy(call).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(404));}
 @Test void closedOwnerAllowedOthersHiddenAndOpenedMemberAllowed(){var f=fixture();assertThat(access.attachment(f.owner(),f.attachment().getId()).key()).isEqualTo(f.attachment().getS3Key());denied(()->access.attachment(f.viewer(),f.attachment().getId()));denied(()->access.attachment(f.viewer(),Long.MAX_VALUE));
  when(opening.isOpened(anyLong())).thenReturn(true);assertThat(access.attachment(f.viewer(),f.attachment().getId()).key()).isEqualTo(f.attachment().getS3Key());}
 @Test void removedOwnerCannotReadEvenThroughLegacyCompletedUpload(){var f=fixture();f.membership().softDelete();flushAndClear();denied(()->access.attachment(f.owner(),f.attachment().getId()));denied(()->access.upload(f.owner(),f.upload()));}
 @Test void deletedAttachmentNeverFallsBackToUnboundOwnerPreview(){var f=fixture();f.attachment().softDelete();flushAndClear();denied(()->access.upload(f.owner(),f.upload()));}
 @Test void deletedNoteIsNotReadable(){var f=fixture();f.attachment().getNote().softDelete();flushAndClear();denied(()->access.attachment(f.owner(),f.attachment().getId()));}
}
