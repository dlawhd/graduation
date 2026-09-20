package shop.esjh.memoryjar.service.ai;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.jar.request.JarCreateRequest;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.config.exception.ApiException;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CopyObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Draft의 선택 이미지를 영구 S3 영역으로 복사한 뒤 Jar 최종화를 조정한다.
 * 느린 S3 I/O와 짧은 DB 확정 트랜잭션을 분리하고, DB 확정 실패 시 이 요청의 복사본만 보상 삭제한다.
 */
@Service
public class JarDesignFinalizeService {

    private final JarDesignFinalizePersistenceService persistenceService;
    private final JarDesignFinalS3KeyFactory finalS3KeyFactory;
    private final S3Client s3Client;
    private final S3Properties s3Properties;

    public JarDesignFinalizeService(JarDesignFinalizePersistenceService persistenceService,
                                    JarDesignFinalS3KeyFactory finalS3KeyFactory,
                                    S3Client s3Client,
                                    S3Properties s3Properties) {
        this.persistenceService = persistenceService;
        this.finalS3KeyFactory = finalS3KeyFactory;
        this.s3Client = s3Client;
        this.s3Properties = s3Properties;
    }

    /** ORIGINAL·AI·DEFAULT 선택을 최종 Jar로 한 번만 확정한다. API는 다음 단계에서 이 메서드를 호출한다. */
    public JarDesignFinalizePersistenceService.FinalizeResult finalizeDraft(Long userId, Long draftId,
                                                                             JarCreateRequest request) {
        JarDesignFinalizePersistenceService.FinalizeTarget target = persistenceService.prepare(userId, draftId);
        if (target.designType() == JarDraftDesignType.DEFAULT) {
            return persistenceService.finalizeDefault(userId, draftId, request, target);
        }

        String finalS3Key = finalS3KeyFactory.createKey(userId, draftId);
        copyToPermanentS3(target.sourceS3Key(), finalS3Key);
        try {
            return persistenceService.finalizeCustom(userId, draftId, request, target, finalS3Key);
        } catch (RuntimeException exception) {
            // DB 확정 실패 시 이 요청만 만든 UUID 복사본을 지운다. 기존 임시 원본·후보는 건드리지 않는다.
            deleteCopiedFinalQuietly(finalS3Key);
            throw exception;
        }
    }

    private void copyToPermanentS3(String sourceS3Key, String finalS3Key) {
        try {
            // DB의 서버 생성 Key를 다시 확인해 누락된 임시 파일을 DEFAULT 결과로 오인하지 않는다.
            s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(s3Properties.getBucket())
                    .key(sourceS3Key)
                    .build());
            s3Client.copyObject(CopyObjectRequest.builder()
                    .copySource(s3Properties.getBucket() + "/" + sourceS3Key)
                    .bucket(s3Properties.getBucket())
                    .key(finalS3Key)
                    .build());
        } catch (S3Exception | SdkClientException exception) {
            throw new ApiException(AiDraftErrorCode.FINAL_IMAGE_COPY_FAILED);
        }
    }

    private void deleteCopiedFinalQuietly(String finalS3Key) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(s3Properties.getBucket())
                    .key(finalS3Key)
                    .build());
        } catch (S3Exception | SdkClientException ignored) {
            // 프로세스 종료 등으로 남은 영구 영역 객체는 자동 TTL로 지우지 않고 별도 운영 대조 대상으로 남긴다.
        }
    }
}
