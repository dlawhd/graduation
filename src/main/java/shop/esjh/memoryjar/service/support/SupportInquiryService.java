package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.data.domain.PageRequest;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.support.*;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationPreviewResponse;
import shop.esjh.memoryjar.repository.support.SupportInquiryRepository;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.core.exception.SdkClientException;
import java.time.Duration;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 원본 사본 보관과 만료 파일 정리를 조정한다. S3를 기다리는 동안 DB 잠금을 잡지 않는다. */
@Service
@RequiredArgsConstructor
public class SupportInquiryService {
    private final SupportInquiryPersistenceService persistence;
    private final SupportInquiryRepository inquiries;
    private final S3Client s3;
    private final S3Presigner presigner;
    private final S3Properties properties;
    private static final Logger log = LoggerFactory.getLogger(SupportInquiryService.class);

    /** 파일 보관이 성공한 뒤에만 접수 완료를 반환한다. 실패 예약도 남겨 다음 정리 주기에서 삭제한다. */
    public SupportInquiryResponse create(Long userId, SupportCreateRequest request) {
        var target = persistence.reserve(userId, request);
        if (!target.alreadySubmitted()) {
            try {
                s3.copyObject(CopyObjectRequest.builder().bucket(properties.getBucket()).key(target.imageKey())
                        .copySource(properties.getBucket() + "/" + target.sourceKey()).build());
                persistence.completeCopy(userId, target);
            } catch (RuntimeException exception) {
                // 예외 원문에는 S3 키/URL이 들어갈 수 있으므로 원문과 스택을 출력하지 않는다.
                persistence.failCopy(target);
                log.warn("문의 원본 보관 실패 inquiryId={}", target.inquiryId());
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "원본 사진을 보관하지 못해 문의가 접수되지 않았습니다. 잠시 후 다시 확인해 주세요.");
            }
        }
        return persistence.detail(userId, target.inquiryId(), false);
    }

    public JarAiGenerationPreviewResponse preview(Long userId, Long id, boolean operator) {
        var target = persistence.image(userId, id, operator);
        var now = SupportInquiryPersistenceService.now();
        long seconds = Math.min(60, Duration.between(now, target.expiresAt()).getSeconds());
        // 권한 검사 후 시간이 흘러도 사진 보관 기한을 넘는 URL을 발급하지 않는다.
        if (seconds < 1) throw new ResponseStatusException(HttpStatus.GONE, "사진 보관 기간이 지났습니다.");
        var signed = presigner.presignGetObject(GetObjectPresignRequest.builder().signatureDuration(Duration.ofSeconds(seconds))
                .getObjectRequest(GetObjectRequest.builder().bucket(properties.getBucket()).key(target.key()).build()).build());
        return new JarAiGenerationPreviewResponse(signed.url().toString(), now.plusSeconds(seconds).atOffset(ZoneOffset.ofHours(9)));
    }

    /** 한 번에 50건만 처리한다. 삭제 실패 시 삭제 완료 표시를 남기지 않아 다음 실행에서 재시도한다. */
    public void cleanup() {
        var now = SupportInquiryPersistenceService.now();
        for (Long id : inquiries.findImageCleanupIds(now, now.minusMinutes(10), PageRequest.of(0, 50))) {
            var target = persistence.prepareDelete(id);
            if (target == null) continue;
            try {
                s3.deleteObject(DeleteObjectRequest.builder().bucket(properties.getBucket()).key(target.key()).build());
                persistence.deleted(id, target.key());
            } catch (S3Exception | SdkClientException exception) {
                log.warn("문의 사진 정리 실패 inquiryId={}", id);
            }
        }
        for (Long id : inquiries.findContentCleanupIds(now, PageRequest.of(0, 50))) persistence.redact(id);
        persistence.purgeAudits();
    }
}
