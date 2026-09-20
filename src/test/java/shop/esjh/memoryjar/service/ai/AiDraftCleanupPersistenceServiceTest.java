package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** stale timeout은 잠금 아래에서만 PROCESSING을 실패로 끝내고, 늦은 성공 처리의 전제가 사라지게 한다. */
@ExtendWith(MockitoExtension.class)
class AiDraftCleanupPersistenceServiceTest {

    @Mock private JarDesignDraftRepository draftRepository;
    @Mock private JarAiGenerationRepository generationRepository;

    @Test
    void timeoutIfStillStale_marksOnlyProcessingGenerationAsTimeout() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 20, 12, 0);
        LocalDateTime cutoff = now.minusMinutes(10);
        JarDesignDraft draft = mock(JarDesignDraft.class);
        JarAiGeneration generation = mock(JarAiGeneration.class);
        User owner = mock(User.class);
        when(draftRepository.findByDraftIdForUpdate(10L)).thenReturn(Optional.of(draft));
        when(generationRepository.findByGenerationIdAndDraft_DraftId(100L, 10L)).thenReturn(Optional.of(generation));
        when(generation.getStatus()).thenReturn(JarAiGenerationStatus.PROCESSING);
        when(generation.getCreatedAt()).thenReturn(cutoff.minusSeconds(1));
        when(draft.getOwner()).thenReturn(owner);
        when(owner.getId()).thenReturn(1L);

        var target = service().timeoutIfStillStale(10L, 100L, cutoff, now);

        assertThat(target).contains(new AiDraftCleanupPersistenceService.GenerationCleanupTarget(1L, 10L, 100L));
        verify(generation).markFailed(JarAiGenerationErrorCode.GENERATION_TIMEOUT,
                "AI 생성 시간이 제한을 초과했습니다.", now);
    }

    private AiDraftCleanupPersistenceService service() {
        return new AiDraftCleanupPersistenceService(draftRepository, generationRepository);
    }
}
