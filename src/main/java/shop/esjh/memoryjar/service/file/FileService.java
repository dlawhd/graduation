package shop.esjh.memoryjar.service.file;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.file.request.FileCompleteRequest;
import shop.esjh.memoryjar.dto.file.request.FilePresignRequest;
import shop.esjh.memoryjar.dto.file.response.FileCompleteResponse;
import shop.esjh.memoryjar.dto.file.response.FilePresignResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.model.file.FileUploadCompletionTarget;
import shop.esjh.memoryjar.repository.UserRepository;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.CopyObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/*
 * FileService 역할
 *
 * 파일 업로드 전체 흐름을 조정한다.
 *
 * 1. Presigned URL을 발급한다.
 * 2. 업로드 대기 기록을 DB에 저장한다.
 * 3. 업로드 완료 요청이 오면 DB 정보를 짧게 확인한다.
 * 4. DB 트랜잭션 밖에서 실제 S3 파일을 검사한다.
 * 5. S3 검증에 성공하면 짧은 DB 트랜잭션으로 완료 처리한다.
 */
@Service
public class FileService {
    private static final Logger log = LoggerFactory.getLogger(FileService.class);

    private final UploadedMediaValidator mediaValidator;
    private final FileUploadReservationService reservations;
    private final S3PresignService s3PresignService;
    private final S3Client s3Client;
    private final S3Properties s3Properties;
    private final UserRepository userRepository;
    private final FileUploadTransactionService fileUploadTransactionService;

    public FileService(
            S3PresignService s3PresignService,
            S3Client s3Client,
            S3Properties s3Properties,
            UserRepository userRepository,
            FileUploadTransactionService fileUploadTransactionService,
            UploadedMediaValidator mediaValidator, FileUploadReservationService reservations
    ) {
        this.mediaValidator=mediaValidator; this.reservations=reservations;
        this.s3PresignService = s3PresignService;
        this.s3Client = s3Client;
        this.s3Properties = s3Properties;
        this.userRepository = userRepository;
        this.fileUploadTransactionService =
                fileUploadTransactionService;
    }

    /*
     * Presigned URL을 발급하고
     * DB에 PRESIGNED 상태의 업로드 기록을 저장한다.
     */
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public FilePresignResponse createPresignedUrl(
            Long currentUserId,
            FilePresignRequest request
    ) {
        getUserOrThrow(currentUserId);
        // 서명 자체는 로컬 연산이지만 인증정보 갱신은 네트워크를 사용할 수 있어 DB 잠금 밖에서 준비한다.
        FilePresignResponse ticket=s3PresignService.createPresignedUrl(request);
        return reservations.reserve(currentUserId,request,ticket);
    }

    /*
     * 파일 업로드 완료 흐름을 조정한다.
     *
     * NOT_SUPPORTED는 현재 메서드가 실행되는 동안
     * 기존 DB 트랜잭션이 있다면 잠시 중단한다.
     *
     * 따라서 S3 응답을 기다리는 동안
     * DB 트랜잭션과 커넥션을 점유하지 않는다.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public FileCompleteResponse completeUpload(
            Long currentUserId,
            FileCompleteRequest request
    ) {
        /*
         * 1단계
         *
         * 짧은 읽기 트랜잭션으로
         * 업로드 기록과 요청 권한을 확인한다.
         */
        FileUploadCompletionTarget target =
                fileUploadTransactionService
                        .getCompletionTarget(
                                currentUserId,
                                request.s3Key(),
                                request.purpose()
                        );

        if (target.existing() != null) return target.existing();
        try {
            return completeVerifiedUpload(currentUserId, request, target);
        } catch (RuntimeException failure) {
            // 다른 완료 요청이 임시 파일을 지웠거나 DB 커밋 응답만 유실된 경우 최초 결과를 돌려준다.
            try {
                var committed = fileUploadTransactionService.completedReceipt(currentUserId, request.s3Key(), request.purpose());
                if (committed != null) return committed;
            } catch (RuntimeException verificationUnavailable) { /* 확인 불가 시 성공으로 추측하지 않는다. */ }
            throw failure;
        }
    }

    private FileCompleteResponse completeVerifiedUpload(Long currentUserId, FileCompleteRequest request, FileUploadCompletionTarget target) {

        /*
         * 2단계
         *
         * DB 트랜잭션이 없는 상태에서
         * 실제 S3 파일을 확인한다.
         */
        HeadObjectResponse headObject =
                headObjectOrThrow(S3PresignService.stagingKey(target.s3Key()));

        validateUploadedFile(
                target,
                headObject
        );

        mediaValidator.validate(target,headObject.eTag());

        // 검사한 원본 버전만, 아직 없는 완료 위치로 복사한다. 모든 S3 I/O는 DB 트랜잭션 밖이다.
        publishImmutableFile(target, headObject);

        /*
         * 3단계
         *
         * 짧은 쓰기 트랜잭션으로
         * 업로드 row를 잠그고 완료 처리한다.
         */
        FileCompleteResponse response = fileUploadTransactionService.markCompleted(
                target.uploadId(),
                currentUserId,
                request.purpose()
        );
        // 정리 실패 때문에 이미 커밋된 완료 응답을 실패로 바꾸지 않는다.
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(s3Properties.getBucket())
                    .key(S3PresignService.stagingKey(target.s3Key())).build());
        } catch (software.amazon.awssdk.core.exception.SdkException failure) {
            log.warn("FILE_UPLOAD_STAGING_CLEANUP_FAILED failureType={}", failure.getClass().getSimpleName());
        }
        return response;
    }

    /** HEAD 검사와 복사 사이의 원본 교체 및 동시 완료 요청의 최종 파일 덮어쓰기를 모두 막는다. */
    private void publishImmutableFile(FileUploadCompletionTarget target, HeadObjectResponse source) {
        if (source.eTag() == null || source.eTag().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "업로드된 파일의 버전을 확인할 수 없어.");
        }
        String copySource = URLEncoder.encode(s3Properties.getBucket() + "/"
                + S3PresignService.stagingKey(target.s3Key()), StandardCharsets.UTF_8)
                .replace("%2F", "/").replace("+", "%20");
        try {
            s3Client.copyObject(CopyObjectRequest.builder().bucket(s3Properties.getBucket()).key(target.s3Key())
                    .copySource(copySource).copySourceIfMatch(source.eTag())
                    .metadataDirective(software.amazon.awssdk.services.s3.model.MetadataDirective.REPLACE)
                    .contentType(target.contentType())
                    // 사용 중인 SDK에 목적지 조건 전용 필드가 없어 공식 S3 헤더를 직접 서명한다.
                    .overrideConfiguration(config -> config.putHeader("If-None-Match", "*")).build());
        } catch (S3Exception failure) {
            if (failure.statusCode() == 412) {
                // 다른 완료 요청이나 DB 저장 실패 후 재시도가 이미 확정한 객체는 변경하지 않는다.
                try {
                    var published=headObjectOrThrow(target.s3Key());
                    validateUploadedFile(target,published);
                    mediaValidator.validatePublished(target,published.eTag());
                    return;
                }
                catch (ResponseStatusException missing) {
                    if (missing.getStatusCode().value() != 404) throw missing;
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "검사 중 파일이 변경됐어. 다시 업로드해 줘.");
                }
            }
            if (failure.statusCode() == 409) throw new ResponseStatusException(HttpStatus.CONFLICT, "파일 완료 처리가 겹쳤어. 잠시 후 다시 시도해 줘.");
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "파일을 안전하게 확정하지 못했어.");
        } catch (SdkClientException failure) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "파일을 안전하게 확정하지 못했어.");
        }
    }

    /*
     * S3에 저장된 실제 파일의 크기와 타입이
     * Presigned URL 발급 당시 값과 같은지 확인한다.
     */
    private void validateUploadedFile(
            FileUploadCompletionTarget target,
            HeadObjectResponse headObject
    ) {
        // 실제 파일 크기가 발급 당시 요청한 크기와 같은지 확인한다.
        if (headObject.contentLength() == null
                || !headObject.contentLength()
                .equals(target.size())) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "업로드된 파일 크기가 요청과 달라."
            );
        }

        /*
         * S3가 contentType을 제공한 경우에만
         * 발급 당시 파일 타입과 같은지 확인한다.
         */
        if (headObject.contentType() != null
                && !headObject.contentType().isBlank()
                && !headObject.contentType()
                .equals(target.contentType())) {

            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "업로드된 파일 타입이 요청과 달라."
            );
        }
    }

    /*
     * S3에 실제 파일이 존재하는지 확인한다.
     *
     * S3 SDK 예외를 사용자에게 전달할
     * HTTP 상태 코드로 변환한다.
     */
    private HeadObjectResponse headObjectOrThrow(
            String s3Key
    ) {
        try {
            return s3Client.headObject(builder ->
                    builder
                            .bucket(s3Properties.getBucket())
                            .key(s3Key)
            );

        } catch (NoSuchKeyException e) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "S3에 업로드된 파일을 찾을 수 없어."
            );

        } catch (S3Exception e) {
            // S3 서버가 404를 반환한 경우다.
            if (e.statusCode() == 404) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "S3에 업로드된 파일을 찾을 수 없어."
                );
            }

            // S3 서버가 그 외 오류를 반환한 경우다.
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "S3 파일 확인 중 오류가 발생했어."
            );

        } catch (SdkClientException e) {
            /*
             * 네트워크 연결 실패, 응답 지연, 타임아웃처럼
             * S3 서버의 정상 응답을 받지 못한 경우다.
             */
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "S3 파일 확인 중 오류가 발생했어."
            );
        }
    }

    // Presigned URL을 발급받을 사용자가 실제로 존재하는지 확인한다.
    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() ->
                        new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "사용자를 찾을 수 없어."
                        )
                );
    }
}
