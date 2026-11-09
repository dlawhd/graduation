package shop.esjh.memoryjar.service.file;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.file.request.FileCompleteRequest;
import shop.esjh.memoryjar.dto.file.response.FileCompleteResponse;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.model.file.FileUploadCompletionTarget;
import shop.esjh.memoryjar.repository.*;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import java.util.function.Consumer;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 확정된 파일의 재요청은 임시 S3 객체 유무와 관계없이 최초 완료 결과로 복구한다. */
class FileCompletionRecoveryTest {
    private final S3Client s3=mock(S3Client.class);
    private final FileUploadTransactionService database=mock(FileUploadTransactionService.class);
    private final S3Properties storage=new S3Properties();
    private final FileCompleteRequest request=new FileCompleteRequest(FilePurpose.NOTE,"notes/retry.png");
    private final FileCompleteResponse receipt=new FileCompleteResponse("notes/retry.png",FilePurpose.NOTE,
            "https://fixture.invalid/photo","image/png",10L,OffsetDateTime.parse("2026-11-08T12:00:00+09:00"));
    FileService service(){storage.setBucket("fixture");return new FileService(mock(S3PresignService.class),s3,storage,
            mock(UserRepository.class),database,mock(UploadedMediaValidator.class),mock(FileUploadReservationService.class));}
    @Test void completedSnapshotAvoidsAllStorageCalls() {
        when(database.getCompletionTarget(1L,request.s3Key(),request.purpose()))
                .thenReturn(new FileUploadCompletionTarget(1L,request.s3Key(),"image/png",10L,receipt));
        assertThat(service().completeUpload(1L,request)).isEqualTo(receipt);verifyNoInteractions(s3);
    }
    @Test void deletedPendingObjectDoesNotBreakAnotherCompletedRequest() {
        when(database.getCompletionTarget(1L,request.s3Key(),request.purpose()))
                .thenReturn(new FileUploadCompletionTarget(1L,request.s3Key(),"image/png",10L));
        when(s3.headObject(org.mockito.ArgumentMatchers.<Consumer<HeadObjectRequest.Builder>>any()))
                .thenThrow(NoSuchKeyException.builder().statusCode(404).build());
        when(database.completedReceipt(1L,request.s3Key(),request.purpose())).thenReturn(receipt);
        assertThat(service().completeUpload(1L,request)).isEqualTo(receipt);
        verify(s3,never()).copyObject(any(CopyObjectRequest.class));
    }
    @Test void lostCommitResultIsRecoveredWithoutRewritingFinalFile() {
        when(database.getCompletionTarget(1L,request.s3Key(),request.purpose()))
                .thenReturn(new FileUploadCompletionTarget(1L,request.s3Key(),"image/png",10L));
        when(s3.headObject(org.mockito.ArgumentMatchers.<Consumer<HeadObjectRequest.Builder>>any()))
                .thenReturn(HeadObjectResponse.builder().contentLength(10L).contentType("image/png").eTag("fixture-version").build());
        when(database.markCompleted(1L,1L,request.purpose())).thenThrow(new IllegalStateException("fixture lost acknowledgement"));
        when(database.completedReceipt(1L,request.s3Key(),request.purpose())).thenReturn(receipt);
        assertThat(service().completeUpload(1L,request)).isEqualTo(receipt);
        verify(s3).copyObject(any(CopyObjectRequest.class));
    }
}
