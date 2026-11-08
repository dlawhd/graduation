package shop.esjh.memoryjar.service.note;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.dto.note.request.*;
import shop.esjh.memoryjar.enums.jar.JarRole;
import shop.esjh.memoryjar.enums.file.*;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import shop.esjh.memoryjar.service.jar.JarOpenService;
import static org.assertj.core.api.Assertions.*;

/** 실제 MariaDB에서 응답 유실 재시도·최초 동시 작성·첨부 사용권을 함께 검사한다. 외부 서비스는 사용하지 않는다. */
@DataJpaTest(showSql=false)
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class, NoteService.class, NoteAttachmentService.class})
@Transactional(propagation=Propagation.NOT_SUPPORTED)
class NoteCreateRetryIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired NoteService notes;
    @Autowired FileUploadRepository uploads;
    @Autowired PlatformTransactionManager manager;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean JarOpenService open;
    @MockitoBean NoteReactionService reactions;
    @MockitoBean NoteCommentService comments;

    record Fixture(long userId, long jarId, String key) {}
    Fixture fixture() {
        return new TransactionTemplate(manager).execute(tx -> {
            String id=UUID.randomUUID().toString(); var user=saveUser(id,id+"@example.com","시험");
            var jar=saveJar(user,"재시도 시험",LocalDateTime.now().plusDays(1));
            saveJarMember(jar,user,JarRole.OWNER,LocalDateTime.now());
            String key="notes/"+id+".png";
            var upload=FileUpload.builder().user(user).purpose(FilePurpose.NOTE).status(FileUploadStatus.PRESIGNED)
                    .s3Key(key).publicUrl("https://fixture.invalid/photo").contentType("image/png").size(10L).build();
            upload.markCompleted(); uploads.saveAndFlush(upload);
            return new Fixture(user.getId(),jar.getJarId(),key);
        });
    }
    NoteCreateRequest request(Fixture f,String id,String content,boolean attach) {
        return new NoteCreateRequest("제목",content,null,null,
                attach?List.of(new NoteAttachmentCreateRequest(f.key(),"사진")):List.of(), List.of("추억"),id);
    }
    @Test void lostResponseReturnsSameNoteAndConsumesAttachmentsOnlyOnce() {
        var f=fixture(); var request=request(f,"retry-1","본문",true);
        var first=notes.createNote(f.userId(),f.jarId(),request);
        assertThat(notes.createNote(f.userId(),f.jarId(),request)).isEqualTo(first);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notes WHERE jar_id=?",Long.class,f.jarId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM note_attachments WHERE s3_key=?",Long.class,f.key())).isEqualTo(1);
        assertThat(uploads.findByS3Key(f.key()).orElseThrow().getStatus()).isEqualTo(FileUploadStatus.CONSUMED);
    }
    @Test void sameNumberWithChangedContentIsRejected() {
        var f=fixture();notes.createNote(f.userId(),f.jarId(),request(f,"retry-2","원본",false));
        assertThatThrownBy(()->notes.createNote(f.userId(),f.jarId(),request(f,"retry-2","변경",false)))
                .isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));
    }
    @Test void concurrentRequestsReturnOneDurableResult() throws Exception {
        var f=fixture();var request=request(f,"retry-3","본문",true);
        var executor=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try {
            Callable<Long> action=()->{start.await();return notes.createNote(f.userId(),f.jarId(),request).noteId();};
            var a=executor.submit(action);var b=executor.submit(action);start.countDown();
            assertThat(a.get(20,TimeUnit.SECONDS)).isEqualTo(b.get(20,TimeUnit.SECONDS));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notes WHERE jar_id=?",Long.class,f.jarId())).isEqualTo(1);
        } finally {start.countDown();executor.shutdownNow();}
    }
    @Test void oldClientsCanStillCreateDistinctNotesWithoutRequestId() {
        var f=fixture();var r=request(f,null,"기존 요청",false);
        assertThat(notes.createNote(f.userId(),f.jarId(),r).noteId()).isNotEqualTo(notes.createNote(f.userId(),f.jarId(),r).noteId());
    }
    @Test void membershipIsCheckedBeforeReturningAnExistingResult() {
        var f=fixture();var r=request(f,"retry-4","본문",false);notes.createNote(f.userId(),f.jarId(),r);
        jdbc.update("UPDATE jar_members SET deleted_at=NOW() WHERE jar_id=? AND user_id=?",f.jarId(),f.userId());
        assertThatThrownBy(()->notes.createNote(f.userId(),f.jarId(),r)).isInstanceOfSatisfying(ResponseStatusException.class,
                e->assertThat(e.getStatusCode().value()).isEqualTo(403));
    }
}
