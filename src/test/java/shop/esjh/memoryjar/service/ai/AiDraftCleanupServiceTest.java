package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.properties.AiCleanupProperties;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** timeout·종료 Draft 정리가 S3 삭제 성공 뒤에만 DB 완료 시각을 남기는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class AiDraftCleanupServiceTest {

    @Mock private AiDraftCleanupPersistenceService persistenceService;
    @Mock private S3Client s3Client;

    @Test
    void runCleanup_timesOutOnlyStillProcessingGenerationWithoutImmediateDeletion() {
        JarAiGenerationRepository.GenerationReference reference = mock(JarAiGenerationRepository.GenerationReference.class);
        when(reference.getDraftId()).thenReturn(10L);
        when(reference.getGenerationId()).thenReturn(100L);
        when(persistenceService.findStaleGenerationReferences(any(), anyInt())).thenReturn(List.of(reference));
        when(persistenceService.timeoutIfStillStale(eq(10L), eq(100L), any(), any()))
                .thenReturn(Optional.of(new AiDraftCleanupPersistenceService.GenerationCleanupTarget(1L, 10L, 100L)));
        arrangeNoOtherWork();

        AiDraftCleanupService.CleanupResult result = service().runCleanup();

        assertThat(result.timedOut()).isEqualTo(1);
        // timeout 직후 늦은 업로드를 지우지 않고 실패 후보 유예 기간 뒤 삭제한다.
        verifyNoInteractions(s3Client);
    }

    @Test
    void runCleanup_marksTerminalObjectsDeletedOnlyAfterS3Deletion() {
        JarAiGenerationRepository.GenerationS3Reference candidate = mock(JarAiGenerationRepository.GenerationS3Reference.class);
        when(candidate.getDraftId()).thenReturn(10L);
        when(candidate.getGenerationId()).thenReturn(100L);
        when(candidate.getGeneratedS3Key()).thenReturn("candidate.png");
        JarDesignDraftRepository.DraftS3Reference original = mock(JarDesignDraftRepository.DraftS3Reference.class);
        when(original.getDraftId()).thenReturn(10L);
        when(original.getOriginalS3Key()).thenReturn("original.png");
        when(persistenceService.findTerminalCandidateReferences(any(), anyInt())).thenReturn(List.of(candidate));
        when(persistenceService.findTerminalOriginalReferences(any(), anyInt())).thenReturn(List.of(original));
        when(persistenceService.markCandidateS3Deleted(eq(10L), eq(100L), eq("candidate.png"), any())).thenReturn(true);
        when(persistenceService.markOriginalS3Deleted(eq(10L), eq("original.png"), any())).thenReturn(true);
        when(persistenceService.findStaleGenerationReferences(any(), anyInt())).thenReturn(List.of());
        when(persistenceService.findExpiredDraftReferences(any(), anyInt())).thenReturn(List.of());

        AiDraftCleanupService.CleanupResult result = service().runCleanup();

        assertThat(result.candidatesDeleted()).isEqualTo(1);
        assertThat(result.originalsDeleted()).isEqualTo(1);
        verify(s3Client, times(2)).deleteObject(any(DeleteObjectRequest.class));
        verify(persistenceService).markCandidateS3Deleted(eq(10L), eq(100L), eq("candidate.png"), any());
        verify(persistenceService).markOriginalS3Deleted(eq(10L), eq("original.png"), any());
    }

    @Test
    void runCleanup_doesNotMarkCandidateDeletedWhenS3DeletionFails() {
        JarAiGenerationRepository.GenerationS3Reference candidate = mock(JarAiGenerationRepository.GenerationS3Reference.class);
        when(candidate.getGenerationId()).thenReturn(100L);
        when(candidate.getGeneratedS3Key()).thenReturn("candidate.png");
        when(persistenceService.findStaleGenerationReferences(any(), anyInt())).thenReturn(List.of());
        when(persistenceService.findExpiredDraftReferences(any(), anyInt())).thenReturn(List.of());
        when(persistenceService.findTerminalCandidateReferences(any(), anyInt())).thenReturn(List.of(candidate));
        when(persistenceService.findTerminalOriginalReferences(any(), anyInt())).thenReturn(List.of());
        doThrow(S3Exception.builder().statusCode(500).build()).when(s3Client).deleteObject(any(DeleteObjectRequest.class));

        AiDraftCleanupService.CleanupResult result = service().runCleanup();

        assertThat(result.candidatesDeleted()).isZero();
        verify(persistenceService, never()).markCandidateS3Deleted(anyLong(), anyLong(), anyString(), any());
    }

    private AiDraftCleanupService service() {
        S3Properties s3Properties = new S3Properties();
        s3Properties.setBucket("test-bucket");
        AiCleanupProperties cleanupProperties = new AiCleanupProperties();
        return new AiDraftCleanupService(persistenceService, s3Client, s3Properties, cleanupProperties);
    }

    @Test
    void failedCandidateDeletionIsRetriedAndMarkedOnlyAfterSuccess() {
        var failed = mock(JarAiGenerationRepository.FailedCandidateReference.class);
        when(failed.getDraftId()).thenReturn(10L);
        when(failed.getGenerationId()).thenReturn(100L);
        when(failed.getCandidateKey()).thenReturn("candidate.png");
        when(persistenceService.findFailedCandidateReferences(any(), anyInt())).thenReturn(List.of(failed));
        when(persistenceService.canDeleteFailedCandidate(10L, 100L, "candidate.png")).thenReturn(true);
        when(s3Client.deleteObject(any(DeleteObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(503).build())
                .thenReturn(software.amazon.awssdk.services.s3.model.DeleteObjectResponse.builder().build());
        assertThat(service().runCleanup().candidatesDeleted()).isZero();
        verify(persistenceService, never()).markFailedCandidateDeleted(any(), any(), any(), any());
        assertThat(service().runCleanup().candidatesDeleted()).isEqualTo(1);
        verify(persistenceService).markFailedCandidateDeleted(eq(10L), eq(100L), eq("candidate.png"), any());
    }

    @Test
    void changedOrSucceededCandidateIsProtectedDuringRetry() {
        var reference = mock(JarAiGenerationRepository.FailedCandidateReference.class);
        when(reference.getDraftId()).thenReturn(10L);
        when(reference.getGenerationId()).thenReturn(100L);
        when(reference.getCandidateKey()).thenReturn("candidate.png");
        when(persistenceService.findFailedCandidateReferences(any(), anyInt())).thenReturn(List.of(reference));
        assertThat(service().runCleanup().candidatesDeleted()).isZero();
        verifyNoInteractions(s3Client);
    }

    private void arrangeNoOtherWork() {
        when(persistenceService.findExpiredDraftReferences(any(), anyInt())).thenReturn(List.of());
        when(persistenceService.findTerminalCandidateReferences(any(), anyInt())).thenReturn(List.of());
        when(persistenceService.findTerminalOriginalReferences(any(), anyInt())).thenReturn(List.of());
    }
}
