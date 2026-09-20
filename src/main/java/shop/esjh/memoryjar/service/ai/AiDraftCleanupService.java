package shop.esjh.memoryjar.service.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import shop.esjh.memoryjar.config.properties.AiCleanupProperties;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 오래된 AI 작업을 종료하고, 종료된 Draft의 임시 S3 원본·후보를 정리한다.
 * 모든 S3 호출은 DB 트랜잭션 밖에서 수행하고 삭제 성공 뒤에만 DB 삭제 시각을 기록한다.
 */
@Service
public class AiDraftCleanupService {

    private static final Logger log = LoggerFactory.getLogger(AiDraftCleanupService.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final AiDraftCleanupPersistenceService persistenceService;
    private final AiDraftS3KeyFactory s3KeyFactory;
    private final S3Client s3Client;
    private final S3Properties s3Properties;
    private final AiCleanupProperties properties;

    public AiDraftCleanupService(AiDraftCleanupPersistenceService persistenceService,
                                 AiDraftS3KeyFactory s3KeyFactory,
                                 S3Client s3Client,
                                 S3Properties s3Properties,
                                 AiCleanupProperties properties) {
        this.persistenceService = persistenceService;
        this.s3KeyFactory = s3KeyFactory;
        this.s3Client = s3Client;
        this.s3Properties = s3Properties;
        this.properties = properties;
    }

    /** 스케줄러가 호출하는 한 번의 정리 작업이다. 실패한 개별 S3 삭제는 다음 주기에 재시도한다. */
    public CleanupResult runCleanup() {
        validateProperties();
        LocalDateTime now = LocalDateTime.now(KST);
        int timedOut = timeoutStaleGenerations(now.minusSeconds(properties.getGenerationTimeoutSeconds()), now);
        int expired = expireDueDrafts(now);
        LocalDateTime terminalCutoff = now.minusSeconds(properties.getTerminalDraftGraceSeconds());
        int candidatesDeleted = cleanupTerminalCandidates(terminalCutoff, now);
        int originalsDeleted = cleanupTerminalOriginals(terminalCutoff, now);
        return new CleanupResult(timedOut, expired, candidatesDeleted, originalsDeleted);
    }

    private int timeoutStaleGenerations(LocalDateTime cutoff, LocalDateTime now) {
        int timedOut = 0;
        for (JarAiGenerationRepository.GenerationReference reference
                : persistenceService.findStaleGenerationReferences(cutoff, properties.getBatchSize())) {
            var target = persistenceService.timeoutIfStillStale(reference.getDraftId(), reference.getGenerationId(), cutoff, now);
            if (target.isPresent()) {
                // DB에 Key를 기록하기 전 서버가 죽은 업로드도 Generation ID 경로로 찾아 정리한다.
                var cleanupTarget = target.get();
                deleteQuietly(s3KeyFactory.candidateKey(cleanupTarget.ownerId(), cleanupTarget.draftId(),
                                cleanupTarget.generationId()),
                        "stale AI 후보", cleanupTarget.generationId());
                timedOut++;
            }
        }
        return timedOut;
    }

    private int expireDueDrafts(LocalDateTime now) {
        int expired = 0;
        for (JarDesignDraftRepository.DraftReference reference
                : persistenceService.findExpiredDraftReferences(now, properties.getBatchSize())) {
            if (persistenceService.expireIfDue(reference.getDraftId(), now)) {
                expired++;
            }
        }
        return expired;
    }

    private int cleanupTerminalCandidates(LocalDateTime terminalCutoff, LocalDateTime now) {
        int deleted = 0;
        for (JarAiGenerationRepository.GenerationS3Reference reference
                : persistenceService.findTerminalCandidateReferences(terminalCutoff, properties.getBatchSize())) {
            if (deleteQuietly(reference.getGeneratedS3Key(), "종료 Draft 후보", reference.getGenerationId())
                    && persistenceService.markCandidateS3Deleted(reference.getDraftId(), reference.getGenerationId(),
                    reference.getGeneratedS3Key(), now)) {
                deleted++;
            }
        }
        return deleted;
    }

    private int cleanupTerminalOriginals(LocalDateTime terminalCutoff, LocalDateTime now) {
        int deleted = 0;
        for (JarDesignDraftRepository.DraftS3Reference reference
                : persistenceService.findTerminalOriginalReferences(terminalCutoff, properties.getBatchSize())) {
            if (deleteQuietly(reference.getOriginalS3Key(), "종료 Draft 원본", reference.getDraftId())
                    && persistenceService.markOriginalS3Deleted(reference.getDraftId(), reference.getOriginalS3Key(), now)) {
                deleted++;
            }
        }
        return deleted;
    }

    private boolean deleteQuietly(String s3Key, String objectType, Long id) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(s3Properties.getBucket())
                    .key(s3Key)
                    .build());
            return true;
        } catch (S3Exception | SdkClientException exception) {
            // Key와 이미지 바이트는 로그에 남기지 않는다. 다음 주기에서 DB 기록을 기준으로 재시도한다.
            log.warn("{} S3 삭제에 실패했습니다. id={}", objectType, id);
            return false;
        }
    }

    private void validateProperties() {
        if (properties.getGenerationTimeoutSeconds() < 1 || properties.getTerminalDraftGraceSeconds() < 0
                || properties.getBatchSize() < 1) {
            throw new IllegalStateException("AI 정리 스케줄 설정값이 올바르지 않습니다.");
        }
    }

    /** 한 주기에 실제로 상태/객체 정리가 완료된 수를 운영 로그에 전달한다. */
    public record CleanupResult(int timedOut, int expiredDrafts, int candidatesDeleted, int originalsDeleted) {
        public boolean hasWork() {
            return timedOut > 0 || expiredDrafts > 0 || candidatesDeleted > 0 || originalsDeleted > 0;
        }
    }
}
