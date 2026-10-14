package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.repository.UserRepository;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * S3 저장 성공 뒤 DB Draft 생성 실패 시 같은 요청의 원본 객체를 보상 삭제하는지 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class JarDesignDraftUploadServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private DraftOriginalImageValidator imageValidator;
    @Mock private DraftOriginalImageModerationService moderationService;
    @Mock private S3Client s3Client;
    @Mock private JarDesignDraftPersistenceService persistenceService;
    @Mock private S3Properties s3Properties;
    @InjectMocks private JarDesignDraftUploadService uploadService;

    @Test void borderIsModeratedAndStoredSeparatelyAndBothObjectsAreCompensatedOnDbFailure() throws Exception {
        byte[] border=JarBodyArtworkImageValidatorTest.png(480,true);
        var original=new MockMultipartFile("image","photo.jpg","image/jpeg",new byte[]{1,2,3});
        when(userRepository.existsById(1L)).thenReturn(true);when(s3Properties.getBucket()).thenReturn("private-bucket");
        when(imageValidator.normalizeWithContentFrame(any(byte[].class)))
            .thenReturn(new DraftOriginalImageValidator.NormalizedOriginal(new byte[]{7},null))
            .thenReturn(new DraftOriginalImageValidator.NormalizedOriginal(new byte[]{8},null));
        when(persistenceService.createDraft(eq(1L),anyString(),eq(JarBodyStyle.CUSTOM),isNull(),eq(CustomJarBodyTest.outline()),anyString()))
            .thenThrow(new IllegalStateException("DB failed"));
        assertThatThrownBy(()->uploadService.uploadOriginalAndCreateDraft(1L,original,JarBodyStyle.CUSTOM,CustomJarBodyTest.outline(),JarBodyArtworkImageValidatorTest.file(border)))
            .isInstanceOf(IllegalStateException.class);
        verify(moderationService).verifyAllowed(new byte[]{7});verify(moderationService).verifyAllowed(new byte[]{8});
        var puts=ArgumentCaptor.forClass(PutObjectRequest.class);verify(s3Client,times(2)).putObject(puts.capture(),any(RequestBody.class));
        var keys=puts.getAllValues();assertThat(keys.get(1).key()).isEqualTo(keys.get(0).key()+".body.png");
        var deletes=ArgumentCaptor.forClass(DeleteObjectRequest.class);verify(s3Client,times(2)).deleteObject(deletes.capture());
        assertThat(deletes.getAllValues().stream().map(DeleteObjectRequest::key)).containsExactlyInAnyOrder(keys.get(0).key(),keys.get(1).key());
    }

    @Test void invalidBorderStopsBeforeModerationStorageOrDbWrite() {
        when(userRepository.existsById(1L)).thenReturn(true);
        assertThatThrownBy(()->uploadService.uploadOriginalAndCreateDraft(1L,null,JarBodyStyle.CUSTOM,CustomJarBodyTest.outline(),
            JarBodyArtworkImageValidatorTest.file(new byte[]{1}))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verifyNoInteractions(imageValidator,moderationService,s3Client,persistenceService);
    }

    @Test
    void uploadOriginalAndCreateDraft_savesOnlyAfterValidationAndModeration() {
        MockMultipartFile image = new MockMultipartFile("image", "ignored.jpg", "image/jpeg", new byte[]{1, 2, 3});
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(userRepository.existsById(1L)).thenReturn(true);
        when(s3Properties.getBucket()).thenReturn("private-bucket");
        when(imageValidator.normalizeWithContentFrame(new byte[]{1, 2, 3})).thenReturn(new DraftOriginalImageValidator.NormalizedOriginal(new byte[]{7, 8, 9}, null));
        when(persistenceService.createDraft(eq(1L), anyString(), eq(JarBodyStyle.CAT), isNull())).thenReturn(draft);
        when(draft.getDraftId()).thenReturn(100L);
        when(draft.getExpiresAt()).thenReturn(LocalDateTime.of(2026, 9, 25, 12, 0));

        var response = uploadService.uploadOriginalAndCreateDraft(1L, image, JarBodyStyle.CAT);

        ArgumentCaptor<PutObjectRequest> requestCaptor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(requestCaptor.capture(), any(RequestBody.class));
        assertThat(requestCaptor.getValue().key()).startsWith("jar-design-drafts/originals/").endsWith(".png");
        assertThat(requestCaptor.getValue().ifNoneMatch()).isEqualTo("*");
        verify(imageValidator).normalizeWithContentFrame(new byte[]{1, 2, 3});
        verify(moderationService).verifyAllowed(new byte[]{7, 8, 9});
        verify(persistenceService).createDraft(eq(1L), anyString(), eq(JarBodyStyle.CAT), isNull());
        assertThat(response.draftId()).isEqualTo(100L);
    }

    @Test
    void uploadOriginalAndCreateDraft_deletesS3ObjectWhenDraftPersistenceFails() {
        MockMultipartFile image = new MockMultipartFile("image", "canvas.png", "image/png", new byte[]{1, 2, 3});
        when(userRepository.existsById(1L)).thenReturn(true);
        when(s3Properties.getBucket()).thenReturn("private-bucket");
        when(imageValidator.normalizeWithContentFrame(new byte[]{1, 2, 3})).thenReturn(new DraftOriginalImageValidator.NormalizedOriginal(new byte[]{7, 8, 9}, null));
        when(persistenceService.createDraft(eq(1L), anyString(), isNull(), isNull())).thenThrow(new ApiException(AiDraftErrorCode.DRAFT_NOT_ACTIVE));

        assertThatThrownBy(() -> uploadService.uploadOriginalAndCreateDraft(1L, image))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_NOT_ACTIVE);

        ArgumentCaptor<DeleteObjectRequest> deleteCaptor = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3Client).deleteObject(deleteCaptor.capture());
        assertThat(deleteCaptor.getValue().key()).startsWith("jar-design-drafts/originals/");
    }

    @Test
    void uploadOriginalAndCreateDraft_returnsFeatureCodeWhenOriginalUploadFails() {
        MockMultipartFile image = new MockMultipartFile("image", "canvas.png", "image/png", new byte[]{1, 2, 3});
        when(userRepository.existsById(1L)).thenReturn(true);
        when(s3Properties.getBucket()).thenReturn("private-bucket");
        when(imageValidator.normalizeWithContentFrame(new byte[]{1, 2, 3})).thenReturn(new DraftOriginalImageValidator.NormalizedOriginal(new byte[]{7, 8, 9}, null));
        doThrow(SdkClientException.create("S3 unavailable"))
                .when(s3Client).putObject(any(PutObjectRequest.class), any(RequestBody.class));

        assertThatThrownBy(() -> uploadService.uploadOriginalAndCreateDraft(1L, image))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_SOURCE_UPLOAD_FAILED);

        verify(persistenceService, never()).createDraft(anyLong(), anyString(), any(), any());
    }
}
