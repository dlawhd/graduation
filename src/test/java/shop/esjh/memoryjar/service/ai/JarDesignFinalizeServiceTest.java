package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.dto.jar.request.JarCreateRequest;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarTheme;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CopyObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import shop.esjh.memoryjar.dto.ai.JarDesignCutoutPoint;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Finalize가 DEFAULT를 S3 없이 처리하고, 커스텀 복사 실패를 보상하는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class JarDesignFinalizeServiceTest {
    @Mock private JarDesignFinalizePersistenceService persistenceService;
    @Mock private JarDesignFinalS3KeyFactory keyFactory;
    @Mock private S3Client s3Client;
    @Mock private JarDesignCutoutPathCodec cutoutPathCodec;
    @Mock private JarDesignCutoutImageProcessor cutoutImageProcessor;
    @Mock private ResponseBytes<GetObjectResponse> sourceBytes;

    @Test
    void finalizeDraft_customCopiesThenCommits() {
        var target = customTarget();
        when(persistenceService.prepare(1L, 10L)).thenReturn(target);
        when(keyFactory.createKey(1L, 10L)).thenReturn("final.png");
        when(persistenceService.finalizeCustom(eq(1L), eq(10L), any(), eq(target), eq("final.png")))
                .thenReturn(new JarDesignFinalizePersistenceService.FinalizeResult(100L, JarDraftDesignType.ORIGINAL));

        var result = service().finalizeDraft(1L, 10L, request());

        var copy = ArgumentCaptor.forClass(CopyObjectRequest.class);
        verify(s3Client).copyObject(copy.capture());
        assertThat(copy.getValue().copySource()).isEqualTo("test-bucket/original.png");
        assertThat(copy.getValue().key()).isEqualTo("final.png");
        assertThat(result.jarId()).isEqualTo(100L);
    }

    @Test
    void finalizeDraft_defaultDoesNotCallS3() {
        var target = new JarDesignFinalizePersistenceService.FinalizeTarget(
                JarDraftDesignType.DEFAULT, null, null, null, null, null);
        when(persistenceService.prepare(1L, 10L)).thenReturn(target);
        when(persistenceService.finalizeDefault(eq(1L), eq(10L), any(), eq(target)))
                .thenReturn(new JarDesignFinalizePersistenceService.FinalizeResult(100L, JarDraftDesignType.DEFAULT));

        service().finalizeDraft(1L, 10L, request());

        verifyNoInteractions(s3Client, keyFactory);
    }

    @Test
    void finalizeDraft_deletesOnlyItsCopiedObjectWhenDbFinalizeFails() {
        var target = customTarget();
        when(persistenceService.prepare(1L, 10L)).thenReturn(target);
        when(keyFactory.createKey(1L, 10L)).thenReturn("final.png");
        when(persistenceService.finalizeCustom(eq(1L), eq(10L), any(), eq(target), eq("final.png")))
                .thenThrow(new IllegalStateException("selection changed"));

        try { service().finalizeDraft(1L, 10L, request()); } catch (IllegalStateException ignored) { }

        verify(s3Client).deleteObject(argThat((DeleteObjectRequest delete) -> delete.key().equals("final.png")));
    }

    @Test
    void finalizeDraft_returnsFeatureCodeWhenPermanentCopyFails() {
        var target = customTarget();
        when(persistenceService.prepare(1L, 10L)).thenReturn(target);
        when(keyFactory.createKey(1L, 10L)).thenReturn("final.png");
        doThrow(SdkClientException.create("S3 unavailable")).when(s3Client).copyObject(any(CopyObjectRequest.class));

        assertThatThrownBy(() -> service().finalizeDraft(1L, 10L, request()))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.FINAL_IMAGE_COPY_FAILED);

        verify(persistenceService, never()).finalizeCustom(anyLong(), anyLong(), any(), any(), anyString());
        verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));
    }

    @Test
    void finalizeDraft_cutoutWritesTransparentPngInsteadOfCopyingSource() throws Exception {
        List<JarDesignCutoutPoint> points = List.of(
                new JarDesignCutoutPoint(new BigDecimal("0.1"), new BigDecimal("0.1")),
                new JarDesignCutoutPoint(new BigDecimal("0.9"), new BigDecimal("0.1")),
                new JarDesignCutoutPoint(new BigDecimal("0.5"), new BigDecimal("0.9")));
        var target = new JarDesignFinalizePersistenceService.FinalizeTarget(
                JarDraftDesignType.ORIGINAL, "original.png", null,
                new BigDecimal("0.5"), new BigDecimal("0.5"), new BigDecimal("0.3"), "[cutout]");
        when(persistenceService.prepare(1L, 10L)).thenReturn(target);
        when(keyFactory.createKey(1L, 10L)).thenReturn("final.png");
        when(cutoutPathCodec.decodeRegions("[cutout]")).thenReturn(List.of(points));
        when(s3Client.getObjectAsBytes(any(GetObjectRequest.class))).thenReturn(sourceBytes);
        when(sourceBytes.asByteArray()).thenReturn(new byte[] { 1, 2, 3 });
        when(cutoutImageProcessor.applyTransparentCutoutRegions(new byte[] { 1, 2, 3 }, List.of(points)))
                .thenReturn(new byte[] { 4, 5, 6 });
        when(persistenceService.finalizeCustom(eq(1L), eq(10L), any(), eq(target), eq("final.png")))
                .thenReturn(new JarDesignFinalizePersistenceService.FinalizeResult(100L, JarDraftDesignType.ORIGINAL));

        service().finalizeDraft(1L, 10L, request());

        verify(s3Client).putObject(argThat((PutObjectRequest put) -> put.key().equals("final.png")
                && put.contentType().equals("image/png")), any(RequestBody.class));
        verify(s3Client, never()).copyObject(any(CopyObjectRequest.class));
    }

    private JarDesignFinalizeService service() {
        S3Properties properties = new S3Properties();
        properties.setBucket("test-bucket");
        return new JarDesignFinalizeService(persistenceService, keyFactory, s3Client, properties,
                cutoutPathCodec, cutoutImageProcessor);
    }

    private JarDesignFinalizePersistenceService.FinalizeTarget customTarget() {
        return new JarDesignFinalizePersistenceService.FinalizeTarget(JarDraftDesignType.ORIGINAL, "original.png", null,
                new BigDecimal("0.5"), new BigDecimal("0.5"), new BigDecimal("0.3"));
    }

    private JarCreateRequest request() {
        return new JarCreateRequest("Jar", null, JarTheme.SPRING, 2, LocalDateTime.now().plusDays(1),
                JarOpenMode.ALL_AT_ONCE, JarLockLevel.HIDDEN);
    }
}
