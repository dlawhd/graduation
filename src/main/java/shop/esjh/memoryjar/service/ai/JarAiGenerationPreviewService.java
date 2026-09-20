package shop.esjh.memoryjar.service.ai;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationPreviewResponse;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Draft OWNER에게만 원본 또는 성공 후보의 짧은 수명 Presigned GET URL을 발급한다.
 * DB에는 S3 URL을 저장하지 않고, 클라이언트에도 내부 S3 Key를 전달하지 않는다.
 */
@Service
@RequiredArgsConstructor
public class JarAiGenerationPreviewService {

    private final JarDesignDraftRepository draftRepository;
    private final JarAiGenerationRepository generationRepository;
    private final S3Presigner s3Presigner;
    private final S3Properties s3Properties;

    /** OWNER·ACTIVE·성공 후보를 모두 확인한 다음에만 브라우저용 읽기 URL을 만든다. */
    @Transactional(readOnly = true)
    public JarAiGenerationPreviewResponse createPreviewUrl(Long userId, Long draftId, Long generationId) {
        findOwnedActiveDraft(userId, draftId);

        JarAiGeneration generation = generationRepository.findByGenerationIdAndDraft_DraftId(generationId, draftId)
                .orElseThrow(() -> new ApiException(AiDraftErrorCode.AI_GENERATION_NOT_FOUND));
        if (!generation.isSelectableSucceededCandidate()) {
            throw new ApiException(AiDraftErrorCode.AI_GENERATION_NOT_SELECTABLE);
        }

        return presignPreviewUrl(generation.getGeneratedS3Key());
    }

    /** ORIGINAL 선택 카드도 같은 OWNER·ACTIVE·Private S3 규칙으로 짧은 읽기 URL을 발급한다. */
    @Transactional(readOnly = true)
    public JarAiGenerationPreviewResponse createOriginalPreviewUrl(Long userId, Long draftId) {
        JarDesignDraft draft = findOwnedActiveDraft(userId, draftId);
        return presignPreviewUrl(draft.getOriginalS3Key());
    }

    private JarDesignDraft findOwnedActiveDraft(Long userId, Long draftId) {
        JarDesignDraft draft = draftRepository.findById(draftId)
                .orElseThrow(() -> new ApiException(AiDraftErrorCode.DRAFT_NOT_FOUND));
        if (!draft.isOwner(userId)) {
            throw new ApiException(AiDraftErrorCode.DRAFT_NOT_OWNER);
        }
        if (!draft.isActiveAndNotExpired(java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Seoul")))) {
            throw new ApiException(AiDraftErrorCode.DRAFT_NOT_ACTIVE);
        }
        return draft;
    }

    private JarAiGenerationPreviewResponse presignPreviewUrl(String s3Key) {
        int expiresInSeconds = s3Properties.getPresignExpSeconds();
        if (expiresInSeconds < 1 || s3Properties.getBucket() == null || s3Properties.getBucket().isBlank()
                || s3Key == null || s3Key.isBlank()) {
            throw new ApiException(AiDraftErrorCode.AI_GENERATION_PREVIEW_UNAVAILABLE);
        }

        try {
            PresignedGetObjectRequest presignedRequest = s3Presigner.presignGetObject(
                    GetObjectPresignRequest.builder()
                            .signatureDuration(Duration.ofSeconds(expiresInSeconds))
                            .getObjectRequest(GetObjectRequest.builder()
                                    .bucket(s3Properties.getBucket())
                                    .key(s3Key)
                                    .responseContentType("image/png")
                                    .build())
                            .build());
            return new JarAiGenerationPreviewResponse(
                    presignedRequest.url().toString(),
                    OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(expiresInSeconds));
        } catch (RuntimeException exception) {
            throw new ApiException(AiDraftErrorCode.AI_GENERATION_PREVIEW_UNAVAILABLE);
        }
    }
}
