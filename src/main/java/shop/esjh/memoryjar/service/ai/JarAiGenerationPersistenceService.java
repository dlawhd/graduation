package shop.esjh.memoryjar.service.ai;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.CloudflareAiProperties;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarAiProvider;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * AI 후보 생성에 필요한 짧은 DB 트랜잭션만 담당한다.
 * Cloudflare·S3 같은 느린 네트워크 호출은 이 클래스 밖에서 실행한다.
 */
@Service
public class JarAiGenerationPersistenceService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final JarDesignDraftService draftService;
    private final JarDesignDraftRepository draftRepository;
    private final JarAiGenerationRepository generationRepository;
    private final CloudflareAiProperties cloudflareAiProperties;

    public JarAiGenerationPersistenceService(JarDesignDraftService draftService,
                                             JarDesignDraftRepository draftRepository,
                                             JarAiGenerationRepository generationRepository,
                                             CloudflareAiProperties cloudflareAiProperties) {
        this.draftService = draftService;
        this.draftRepository = draftRepository;
        this.generationRepository = generationRepository;
        this.cloudflareAiProperties = cloudflareAiProperties;
    }

    /** Draft를 잠근 뒤 PROCESSING 중복을 막고, 외부 호출 전에 새 시도를 커밋한다. */
    @Transactional
    public GenerationStartTarget start(Long userId, Long draftId, JarAiStyle style,
                                       AiPromptCatalog.AiPromptDefinition promptDefinition, Long seed) {
        JarDesignDraft draft = draftService.findOwnedActiveDraftForUpdate(userId, draftId);
        if (generationRepository.existsByDraft_DraftIdAndStatus(draft.getDraftId(), JarAiGenerationStatus.PROCESSING)) {
            throw new ApiException(AiDraftErrorCode.AI_GENERATION_ALREADY_PROCESSING);
        }

        JarAiGeneration generation = JarAiGeneration.builder()
                .draft(draft)
                .aiStyle(style)
                .aiProvider(JarAiProvider.CLOUDFLARE)
                .aiModel(cloudflareAiProperties.getModel())
                .promptVersion(promptDefinition.promptVersion())
                .seed(seed)
                .referenceImageVersion(promptDefinition.referenceImageVersion())
                .postprocessVersion(promptDefinition.postprocessVersion())
                .build();
        JarAiGeneration saved = generationRepository.saveAndFlush(generation);

        return new GenerationStartTarget(saved.getGenerationId(), draft.getDraftId(), draft.getOwner().getId(),
                draft.getOriginalS3Key());
    }

    /**
     * Draft 잠금 아래에서 아직 PROCESSING인 경우에만 성공 처리한다.
     * stale 처리나 Draft 종료가 먼저 끝났다면 false를 돌려 후보 S3 객체를 보상 삭제하게 한다.
     */
    @Transactional
    public boolean completeSucceeded(Long draftId, Long generationId, String generatedS3Key) {
        JarDesignDraft draft = draftRepository.findByDraftIdForUpdate(draftId)
                .orElseThrow(() -> new IllegalStateException("AI 후보의 Draft를 찾을 수 없습니다."));
        JarAiGeneration generation = generationRepository.findByGenerationIdAndDraft_DraftId(generationId, draftId)
                .orElseThrow(() -> new IllegalStateException("AI 후보를 찾을 수 없습니다."));

        if (generation.getStatus() != JarAiGenerationStatus.PROCESSING) {
            return false;
        }
        if (!draft.isActiveAndNotExpired(LocalDateTime.now(KST))) {
            generation.markFailed(JarAiGenerationErrorCode.INTERNAL_ERROR,
                    "AI 결과 수신 전에 Draft가 활성 상태가 아니게 되었습니다.", LocalDateTime.now(KST));
            return false;
        }

        generation.markSucceeded(generatedS3Key, LocalDateTime.now(KST));
        return true;
    }

    /** 외부 작업 실패를 아직 PROCESSING인 Generation에만 기록한다. */
    @Transactional
    public boolean completeFailed(Long draftId, Long generationId,
                                   JarAiGenerationErrorCode errorCode, String errorMessage) {
        draftRepository.findByDraftIdForUpdate(draftId)
                .orElseThrow(() -> new IllegalStateException("AI 후보의 Draft를 찾을 수 없습니다."));
        JarAiGeneration generation = generationRepository.findByGenerationIdAndDraft_DraftId(generationId, draftId)
                .orElseThrow(() -> new IllegalStateException("AI 후보를 찾을 수 없습니다."));

        if (generation.getStatus() != JarAiGenerationStatus.PROCESSING) {
            return false;
        }
        generation.markFailed(errorCode, errorMessage, LocalDateTime.now(KST));
        return true;
    }

    /** 외부 호출에 필요한 식별자와 S3 Key만 전달해 영속 Entity가 트랜잭션 밖으로 나가지 않게 한다. */
    public record GenerationStartTarget(Long generationId, Long draftId, Long ownerId, String originalS3Key) {
    }
}
