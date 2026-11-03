package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.*;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.support.SupportAttachmentResponse;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationPreviewResponse;
import shop.esjh.memoryjar.repository.support.SupportAttachmentRepository;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import java.time.*;
import java.util.concurrent.Semaphore;
import java.io.IOException;

/** 이미지 처리 동시 수를 제한하고 외부 저장을 DB 밖에서 조정한다. 예약 키로 실패 후 정리도 추적한다. */
@Service @RequiredArgsConstructor @Transactional(propagation=Propagation.NOT_SUPPORTED)
public class SupportAttachmentService {
    private final SupportAttachmentPersistenceService persistence;
    private final SupportAttachmentRepository attachments;
    private final SupportScreenshotValidator validator;
    private final S3Client s3;
    private final S3Presigner presigner;
    private final S3Properties storage;
    private final Semaphore imageSlots=new Semaphore(2,true);
    private static final Logger log=LoggerFactory.getLogger(SupportAttachmentService.class);

    /** 서버에서 이미지 내용을 검사한다. 처리 슬롯이 차면 무한 대기 대신 재시도 가능한 429를 반환한다. */
    public SupportAttachmentResponse upload(SupportActor actor,Long inquiryId,String requestId,MultipartFile file,boolean shared) {
        if (!shared) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"화면 자료 공유에 동의해 주세요.");
        if (file==null || file.isEmpty() || file.getSize()>SupportScreenshotValidator.MAX_BYTES)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"첨부는 파일당 2MB 이하여야 합니다.");
        if (!imageSlots.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"다른 화면 자료를 처리 중입니다. 잠시 후 다시 첨부해 주세요.");
        try {
            var target=persistence.reserve(actor,inquiryId,requestId);
            if (target.ready()) return target.response();
            try {
                // 소유권·횟수·개수 검사를 먼저 확정한 뒤 디코딩한다. 실패 파일 반복으로 CPU 제한을 우회하지 못한다.
                byte[] png=validator.normalize(file.getBytes());
                s3.putObject(PutObjectRequest.builder().bucket(storage.getBucket()).key(target.key()).contentType("image/png").build(),RequestBody.fromBytes(png));
                return persistence.finish(actor,target,png.length);
            } catch (IOException | RuntimeException e) {
                try { var committed=persistence.failedOrCommitted(actor,target); if (committed!=null) return committed; }
                catch (RuntimeException unavailable) { /* 결과가 불명확하면 키를 보존한다. 정리 작업이 다시 검사한다. */ }
                if (e instanceof ResponseStatusException invalid) throw invalid;
                if (e instanceof IOException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"첨부 파일을 읽지 못했습니다.");
                // AWS 오류 원문에는 버킷·객체 키·역할 정보가 들어갈 수 있다. 고정 분류와 상태만 남긴다.
                if (e instanceof S3Exception storageFailure) {
                    var details=storageFailure.awsErrorDetails();
                    String code=details==null?null:details.errorCode();
                    var known=java.util.Set.of("AccessDenied","NoSuchBucket","InvalidAccessKeyId","SignatureDoesNotMatch",
                            "ExpiredToken","SlowDown","RequestTimeout","ServiceUnavailable","InternalError");
                    log.warn("문의 첨부 보관 실패 attachmentId={} category=S3 s3Status={} errorCode={}",
                            target.id(),storageFailure.statusCode(),code!=null&&known.contains(code)?code:"OTHER");
                } else log.warn("문의 첨부 보관 실패 attachmentId={} category=STORAGE_OR_PERSISTENCE",target.id());
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"화면 자료를 보관하지 못했습니다. 문의 내용은 유지되며 첨부만 다시 시도할 수 있습니다.");
            }
        } finally { imageSlots.release(); }
    }
    public JarAiGenerationPreviewResponse preview(SupportActor actor,Long inquiryId,Long id) {
        var target=persistence.preview(actor,inquiryId,id);var now=SupportInquiryPersistenceService.now();
        long seconds=Math.min(60,Duration.between(now,target.expiresAt()).getSeconds());
        if (seconds<1) throw new ResponseStatusException(HttpStatus.GONE,"첨부 보관 기간이 지났습니다.");
        var signed=presigner.presignGetObject(GetObjectPresignRequest.builder().signatureDuration(Duration.ofSeconds(seconds))
                .getObjectRequest(GetObjectRequest.builder().bucket(storage.getBucket()).key(target.key()).build()).build());
        return new JarAiGenerationPreviewResponse(signed.url().toString(),now.plusSeconds(seconds).atOffset(ZoneOffset.ofHours(9)));
    }
    public void cleanup() {
        var now=SupportInquiryPersistenceService.now();
        for (Long id:attachments.cleanupIds(now,now.minusMinutes(10),PageRequest.of(0,50))) {
            var target=persistence.prepareDelete(id);if(target==null) continue;
            try { s3.deleteObject(DeleteObjectRequest.builder().bucket(storage.getBucket()).key(target.key()).build());persistence.deleted(target); }
            catch (RuntimeException e) { log.warn("문의 첨부 정리 실패 attachmentId={}",id); }
        }
    }
}
