package shop.esjh.memoryjar.service.file;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.*;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 실제 일회용 DB와 가짜 S3로 만료·정리 경쟁·삭제 재시도 및 완료 파일 보호를 검증한다. */
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class, FileStagingCleanupPersistenceService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class FileStagingCleanupIntegrationTest extends AbstractMariaDbRepositoryTest {
    @Autowired FileStagingCleanupPersistenceService persistence;
    @Autowired FileUploadRepository uploads;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;

    private FileUpload fixture(FileUploadStatus status, int expiresInMinutes) {
        return new TransactionTemplate(transactions).execute(tx -> {
            String unique = UUID.randomUUID().toString();
            var user = saveUser(unique, unique + "@example.com", "시험");
            var upload = FileUpload.builder().user(user).purpose(FilePurpose.NOTE).status(status)
                    .s3Key("notes/" + unique + ".png").publicUrl("https://fixture.invalid/" + unique)
                    .contentType("image/png").size(10L).build();
            upload.scheduleStagingCleanup(OffsetDateTime.now().plusMinutes(expiresInMinutes));
            return uploads.saveAndFlush(upload);
        });
    }

    private FileStagingCleanupScheduler scheduler(S3Client s3) {
        var properties = new S3Properties(); properties.setBucket("fixture-bucket");
        return new FileStagingCleanupScheduler(persistence, s3, properties);
    }

    @ParameterizedTest
    @EnumSource(value = FileUploadStatus.class, names = {"PRESIGNED", "COMPLETED", "CONSUMED"})
    void cleanupDeletesOnlyPendingAndPreservesCompletedState(FileUploadStatus status) {
        var upload = fixture(status, -20); var s3 = mock(S3Client.class);
        scheduler(s3).cleanup();
        verify(s3).deleteObject(argThat((DeleteObjectRequest r) ->
                r.key().equals(upload.getS3Key() + ".pending")));
        assertThat(uploads.findById(upload.getId()).orElseThrow().getStatus())
                .isEqualTo(status == FileUploadStatus.PRESIGNED ? FileUploadStatus.EXPIRED : status);
        assertThat(jdbc.queryForObject("SELECT staging_cleaned_at IS NOT NULL FROM file_uploads WHERE upload_id=?",
                Boolean.class, upload.getId())).isTrue();
        scheduler(s3).cleanup(); verifyNoMoreInteractions(s3);
    }

    @Test
    void validUrlAndCompletionGraceAreNotCleaned() {
        var upload = fixture(FileUploadStatus.PRESIGNED, -5); var s3 = mock(S3Client.class);
        assertThat(persistence.findDue(LocalDateTime.now(ZoneId.of("Asia/Seoul")))).doesNotContain(upload.getId());
        scheduler(s3).cleanup(); verifyNoInteractions(s3);
        assertThat(uploads.findById(upload.getId()).orElseThrow().getStatus()).isEqualTo(FileUploadStatus.PRESIGNED);
    }

    @Test
    void failedDeleteRemainsDueForRetryWithoutChangingFinalFile() {
        var upload = fixture(FileUploadStatus.COMPLETED, -20); var s3 = mock(S3Client.class);
        when(s3.deleteObject(any(DeleteObjectRequest.class))).thenThrow(new IllegalStateException("fixture"))
                .thenReturn(software.amazon.awssdk.services.s3.model.DeleteObjectResponse.builder().build());
        scheduler(s3).cleanup();
        assertThat(jdbc.queryForObject("SELECT staging_cleaned_at IS NULL FROM file_uploads WHERE upload_id=?",
                Boolean.class, upload.getId())).isTrue();
        // 다음 예약 시각을 넘긴 상황을 DB 시계에 의존하지 않고 재현한다.
        jdbc.update("UPDATE file_uploads SET staging_cleanup_after=? WHERE upload_id=?",
                LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusSeconds(1), upload.getId());
        scheduler(s3).cleanup();
        verify(s3, times(2)).deleteObject(argThat((DeleteObjectRequest r) -> r.key().endsWith(".pending")));
        assertThat(uploads.findById(upload.getId()).orElseThrow().getStatus()).isEqualTo(FileUploadStatus.COMPLETED);
    }

    @Test
    void simultaneousSchedulersClaimOnceAndExpiredUploadCannotComplete() throws Exception {
        var upload = fixture(FileUploadStatus.PRESIGNED, -20);
        var executor = Executors.newFixedThreadPool(2); var start = new CountDownLatch(1);
        var now = LocalDateTime.now(ZoneId.of("Asia/Seoul"));
        try {
            Callable<Boolean> call = () -> { start.await(); return persistence.claim(upload.getId(), now).isPresent(); };
            var a = executor.submit(call); var b = executor.submit(call); start.countDown();
            assertThat(java.util.List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
            var service = new FileUploadTransactionService(uploads);
            assertThatThrownBy(() -> new TransactionTemplate(transactions).execute(tx ->
                    service.markCompleted(upload.getId(), upload.getUser().getId(), FilePurpose.NOTE)))
                    .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        } finally { executor.shutdownNow(); }
    }
}
