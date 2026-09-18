package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.repository.UserRepository;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.core.sync.RequestBody;
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

    @Test
    void uploadOriginalAndCreateDraft_savesOnlyAfterValidationAndModeration() {
        MockMultipartFile image = new MockMultipartFile("image", "ignored.jpg", "image/jpeg", new byte[]{1, 2, 3});
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(userRepository.existsById(1L)).thenReturn(true);
        when(s3Properties.getBucket()).thenReturn("private-bucket");
        when(persistenceService.createDraft(eq(1L), anyString())).thenReturn(draft);
        when(draft.getDraftId()).thenReturn(100L);
        when(draft.getExpiresAt()).thenReturn(LocalDateTime.of(2026, 9, 25, 12, 0));

        var response = uploadService.uploadOriginalAndCreateDraft(1L, image);

        ArgumentCaptor<PutObjectRequest> requestCaptor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(requestCaptor.capture(), any(RequestBody.class));
        assertThat(requestCaptor.getValue().key()).startsWith("jar-design-drafts/originals/").endsWith(".png");
        assertThat(requestCaptor.getValue().ifNoneMatch()).isEqualTo("*");
        verify(imageValidator).validate(new byte[]{1, 2, 3});
        verify(moderationService).verifyAllowed(new byte[]{1, 2, 3});
        assertThat(response.draftId()).isEqualTo(100L);
    }

    @Test
    void uploadOriginalAndCreateDraft_deletesS3ObjectWhenDraftPersistenceFails() {
        MockMultipartFile image = new MockMultipartFile("image", "canvas.png", "image/png", new byte[]{1, 2, 3});
        when(userRepository.existsById(1L)).thenReturn(true);
        when(s3Properties.getBucket()).thenReturn("private-bucket");
        when(persistenceService.createDraft(eq(1L), anyString())).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT));

        assertThatThrownBy(() -> uploadService.uploadOriginalAndCreateDraft(1L, image))
                .isInstanceOf(ResponseStatusException.class);

        ArgumentCaptor<DeleteObjectRequest> deleteCaptor = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3Client).deleteObject(deleteCaptor.capture());
        assertThat(deleteCaptor.getValue().key()).startsWith("jar-design-drafts/originals/");
    }
}
