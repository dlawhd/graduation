package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.net.URL;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/** 후보 보관함용 읽기 URL이 OWNER·같은 Draft·성공 후보 조건에서만 발급되는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class JarAiGenerationPreviewServiceTest {

    @Mock private JarDesignDraftRepository draftRepository;
    @Mock private JarAiGenerationRepository generationRepository;
    @Mock private S3Presigner s3Presigner;
    @Mock private S3Properties s3Properties;

    @Test
    void createPreviewUrl_issuesShortLivedGetUrlWithoutExposingKeyInDto() throws Exception {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        JarAiGeneration generation = mock(JarAiGeneration.class);
        PresignedGetObjectRequest presignedRequest = mock(PresignedGetObjectRequest.class);
        when(draftRepository.findById(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(generationRepository.findByGenerationIdAndDraft_DraftId(100L, 10L)).thenReturn(Optional.of(generation));
        when(generation.isSelectableSucceededCandidate()).thenReturn(true);
        when(generation.getGeneratedS3Key()).thenReturn("jar-design-drafts/generations/1/10/100.png");
        when(s3Properties.getBucket()).thenReturn("private-bucket");
        when(s3Properties.getPresignExpSeconds()).thenReturn(300);
        when(presignedRequest.url()).thenReturn(new URL("https://signed.example.test/candidate"));
        when(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class))).thenReturn(presignedRequest);

        var response = service().createPreviewUrl(1L, 10L, 100L);

        assertThat(response.previewUrl()).isEqualTo("https://signed.example.test/candidate");
        assertThat(response.expiresAt()).isNotNull();
        ArgumentCaptor<GetObjectPresignRequest> requestCaptor = ArgumentCaptor.forClass(GetObjectPresignRequest.class);
        verify(s3Presigner).presignGetObject(requestCaptor.capture());
        assertThat(requestCaptor.getValue().getObjectRequest().bucket()).isEqualTo("private-bucket");
        assertThat(requestCaptor.getValue().getObjectRequest().key()).isEqualTo("jar-design-drafts/generations/1/10/100.png");
        assertThat(requestCaptor.getValue().signatureDuration().getSeconds()).isEqualTo(300);
    }

    @Test
    void createPreviewUrl_rejectsNonOwnerBeforeGenerationAndS3Lookup() {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        when(draftRepository.findById(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(2L)).thenReturn(false);

        assertThatThrownBy(() -> service().createPreviewUrl(2L, 10L, 100L))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getErrorCode())
                .isEqualTo(AiDraftErrorCode.DRAFT_NOT_OWNER);

        verifyNoInteractions(generationRepository, s3Presigner);
    }

    @Test
    void createOriginalPreviewUrl_issuesOwnerOnlyUrlForNormalizedOriginal() throws Exception {
        JarDesignDraft draft = mock(JarDesignDraft.class);
        PresignedGetObjectRequest presignedRequest = mock(PresignedGetObjectRequest.class);
        when(draftRepository.findById(10L)).thenReturn(Optional.of(draft));
        when(draft.isOwner(1L)).thenReturn(true);
        when(draft.isActiveAndNotExpired(any())).thenReturn(true);
        when(draft.getOriginalS3Key()).thenReturn("jar-design-drafts/1/10/original.png");
        when(s3Properties.getBucket()).thenReturn("private-bucket");
        when(s3Properties.getPresignExpSeconds()).thenReturn(300);
        when(presignedRequest.url()).thenReturn(new URL("https://signed.example.test/original"));
        when(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class))).thenReturn(presignedRequest);

        var response = service().createOriginalPreviewUrl(1L, 10L);

        assertThat(response.previewUrl()).isEqualTo("https://signed.example.test/original");
        ArgumentCaptor<GetObjectPresignRequest> requestCaptor = ArgumentCaptor.forClass(GetObjectPresignRequest.class);
        verify(s3Presigner).presignGetObject(requestCaptor.capture());
        assertThat(requestCaptor.getValue().getObjectRequest().key())
                .isEqualTo("jar-design-drafts/1/10/original.png");
        verifyNoInteractions(generationRepository);
    }

    private JarAiGenerationPreviewService service() {
        return new JarAiGenerationPreviewService(draftRepository, generationRepository, s3Presigner, s3Properties);
    }
}
