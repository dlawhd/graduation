package shop.esjh.memoryjar.service.file;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.*;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 실제 DB의 첨부 사용권과 삭제 예약을 경합시키고 S3는 대역으로만 검증한다. */
@DataJpaTest(showSql=false)
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class,FileUnusedCleanupPersistenceService.class})
@Transactional(propagation=Propagation.NOT_SUPPORTED)
class FileUnusedCleanupIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired FileUnusedCleanupPersistenceService persistence;
    @Autowired FileUploadRepository uploads;
    @Autowired PlatformTransactionManager manager;
    @Autowired JdbcTemplate jdbc;
    FileUpload fixture(boolean referenced) {
        var file=new TransactionTemplate(manager).execute(tx->{
            String id=UUID.randomUUID().toString(); var user=saveUser(id,id+"@example.com","시험");
            var upload=saveFileUpload(user,FilePurpose.NOTE,FileUploadStatus.COMPLETED,"notes/"+id+".png");
            if(referenced){var jar=saveJar(user,"보호",LocalDateTime.now().plusDays(1));var note=saveNote(jar,user,"본문",LocalDateTime.now());saveAttachment(note,0,upload.getS3Key());}
            return upload;
        });
        jdbc.update("UPDATE file_uploads SET unused_cleanup_after=? WHERE upload_id=?",now().minusMinutes(1),file.getId());
        return file;
    }
    LocalDateTime now(){return LocalDateTime.now(ZoneId.of("Asia/Seoul"));}
    FileUnusedCleanupScheduler scheduler(S3Client s3){var p=new S3Properties();p.setBucket("fixture-bucket");return new FileUnusedCleanupScheduler(persistence,s3,p);}
    @Test void onlyOldUnreferencedNoteFileIsDeleted() {
        var file=fixture(false);var s3=mock(S3Client.class);scheduler(s3).cleanup();
        verify(s3).deleteObject(argThat((DeleteObjectRequest r)->r.key().equals(file.getS3Key())));
        assertThat(uploads.findById(file.getId()).orElseThrow().getStatus()).isEqualTo(FileUploadStatus.UNUSED_DELETED);
        scheduler(s3).cleanup();verifyNoMoreInteractions(s3);
    }
    @Test void referenceAndConsumedAndYoungFilesArePreserved() {
        var referenced=fixture(true);var consumed=fixture(false);var young=fixture(false);
        jdbc.update("UPDATE file_uploads SET status='CONSUMED' WHERE upload_id=?",consumed.getId());
        jdbc.update("UPDATE file_uploads SET unused_cleanup_after=? WHERE upload_id=?",now().plusDays(1),young.getId());
        var s3=mock(S3Client.class);scheduler(s3).cleanup();verifyNoInteractions(s3);
        assertThat(uploads.findById(referenced.getId()).orElseThrow().getStatus()).isEqualTo(FileUploadStatus.COMPLETED);
    }
    @Test void storageFailureIsRetriedAndCannotBeConsumedWhileDeleting() {
        var f=fixture(false);var s3=mock(S3Client.class);
        when(s3.deleteObject(any(DeleteObjectRequest.class))).thenThrow(new IllegalStateException("fixture")).thenReturn(DeleteObjectResponse.builder().build());
        scheduler(s3).cleanup();
        assertThat(uploads.findById(f.getId()).orElseThrow().getStatus()).isEqualTo(FileUploadStatus.UNUSED_DELETING);
        int claimed=new TransactionTemplate(manager).execute(tx->uploads.claimCompletedNoteUploads(f.getUser().getId(),List.of(f.getS3Key()),now()));
        assertThat(claimed).isZero();
        jdbc.update("UPDATE file_uploads SET unused_cleanup_after=? WHERE upload_id=?",now().minusSeconds(1),f.getId());
        scheduler(s3).cleanup();verify(s3,times(2)).deleteObject(any(DeleteObjectRequest.class));
        assertThat(uploads.findById(f.getId()).orElseThrow().getStatus()).isEqualTo(FileUploadStatus.UNUSED_DELETED);
    }
    @Test void attachmentClaimAndCleanupHaveExactlyOneWinner() throws Exception {
        var f=fixture(false);var executor=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try {
            var deleting=executor.submit(()->{start.await();return persistence.claim(f.getId(),now()).isPresent();});
            var consuming=executor.submit(()->{start.await();return new TransactionTemplate(manager).execute(tx->uploads.claimCompletedNoteUploads(f.getUser().getId(),List.of(f.getS3Key()),now()));});
            start.countDown();boolean removed=deleting.get(20,TimeUnit.SECONDS);int used=consuming.get(20,TimeUnit.SECONDS);
            assertThat((removed?1:0)+used).isEqualTo(1);
            assertThat(uploads.findById(f.getId()).orElseThrow().getStatus()).isEqualTo(removed?FileUploadStatus.UNUSED_DELETING:FileUploadStatus.CONSUMED);
        } finally {start.countDown();executor.shutdownNow();}
    }
    @Test void oldUnusedProfileAndJarFilesAreAlsoClaimedButReferencedFilesStay() {
        var profile=fixture(false);var jar=fixture(false);var linked=fixture(true);
        jdbc.update("UPDATE file_uploads SET purpose='PROFILE',s3_key=? WHERE upload_id=?","profiles/"+UUID.randomUUID()+".png",profile.getId());
        jdbc.update("UPDATE file_uploads SET purpose='JAR',s3_key=? WHERE upload_id=?","jars/"+UUID.randomUUID()+".png",jar.getId());
        jdbc.update("UPDATE file_uploads SET purpose='PROFILE' WHERE upload_id=?",linked.getId());
        assertThat(persistence.claim(profile.getId(),now())).isPresent();assertThat(persistence.claim(jar.getId(),now())).isPresent();
        assertThat(persistence.claim(linked.getId(),now())).isEmpty();
    }
}
