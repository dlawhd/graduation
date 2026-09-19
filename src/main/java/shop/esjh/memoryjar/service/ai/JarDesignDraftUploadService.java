package shop.esjh.memoryjar.service.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.ai.response.JarDesignDraftCreateResponse;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.repository.UserRepository;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Canvas 또는 외부 원본을 PNG로 정규화·동기 심사·Private S3 저장 후 Draft로 생성하는 전체 흐름을 조정한다.
 */
@Service
public class JarDesignDraftUploadService {

    private static final Logger log = LoggerFactory.getLogger(JarDesignDraftUploadService.class);

    private final UserRepository userRepository;
    private final DraftOriginalImageValidator imageValidator;
    private final DraftOriginalImageModerationService moderationService;
    private final S3Client s3Client;
    private final S3Properties s3Properties;
    private final JarDesignDraftPersistenceService persistenceService;

    public JarDesignDraftUploadService(UserRepository userRepository,
                                       DraftOriginalImageValidator imageValidator,
                                       DraftOriginalImageModerationService moderationService,
                                       S3Client s3Client,
                                       S3Properties s3Properties,
                                       JarDesignDraftPersistenceService persistenceService) {
        this.userRepository = userRepository;
        this.imageValidator = imageValidator;
        this.moderationService = moderationService;
        this.s3Client = s3Client;
        this.s3Properties = s3Properties;
        this.persistenceService = persistenceService;
    }

    /**
     * 프론트가 보낸 파일명·Content-Type을 신뢰하지 않고 실제 바이트만으로 검증한 뒤 Draft를 만든다.
     */
    public JarDesignDraftCreateResponse uploadOriginalAndCreateDraft(Long userId, MultipartFile image) {
        // 존재하지 않는 사용자의 요청으로 외부 심사·S3 비용이 발생하지 않게 먼저 확인한다.
        if (!userRepository.existsById(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다.");
        }

        byte[] uploadedBytes = readImageBytes(image);
        // 실제 바이트 검증과 480×480 PNG 정규화를 먼저 마쳐 심사·S3·AI 입력이 모두 같은 파일을 사용한다.
        byte[] normalizedPngBytes = imageValidator.normalize(uploadedBytes);
        moderationService.verifyAllowed(normalizedPngBytes);

        String originalS3Key = createImmutableOriginalS3Key();
        putPrivateOriginal(originalS3Key, normalizedPngBytes);

        try {
            JarDesignDraft draft = persistenceService.createDraft(userId, originalS3Key);
            return new JarDesignDraftCreateResponse(draft.getDraftId(), draft.getExpiresAt());
        } catch (RuntimeException exception) {
            // S3 저장만 성공하고 DB Draft 생성이 실패하면 이 요청의 고유 객체만 보상 삭제한다.
            deleteOriginalAfterPersistenceFailure(originalS3Key);
            throw exception;
        }
    }

    private byte[] readImageBytes(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "원본 이미지 파일이 필요합니다.");
        }
        try {
            return image.getBytes();
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "원본 이미지 파일을 읽을 수 없습니다.");
        }
    }

    private void putPrivateOriginal(String s3Key, byte[] imageBytes) {
        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(s3Properties.getBucket())
                            .key(s3Key)
                            .contentType("image/png")
                            // UUID Key와 조건부 쓰기를 함께 사용해 이미 검증된 원본 덮어쓰기를 막는다.
                            .ifNoneMatch("*")
                            .build(),
                    RequestBody.fromBytes(imageBytes)
            );
        } catch (S3Exception | SdkClientException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "정규화된 원본 이미지를 안전하게 저장하지 못했습니다.");
        }
    }

    private String createImmutableOriginalS3Key() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        return "jar-design-drafts/originals/"
                + now.getYear() + "/"
                + String.format("%02d", now.getMonthValue()) + "/"
                + String.format("%02d", now.getDayOfMonth()) + "/"
                + UUID.randomUUID() + ".png";
    }

    private void deleteOriginalAfterPersistenceFailure(String s3Key) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(s3Properties.getBucket())
                    .key(s3Key)
                    .build());
        } catch (S3Exception | SdkClientException cleanupException) {
            // 원래 DB 오류를 보존한다. 남은 객체는 이후 cleanup 단계의 점검 대상으로 남는다.
            log.warn("Draft 원본 보상 삭제에 실패했습니다. key={}", s3Key, cleanupException);
        }
    }
}
