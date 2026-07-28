package shop.esjh.memoryjar.service.file;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.file.response.FileCompleteResponse;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import shop.esjh.memoryjar.model.file.FileUploadCompletionTarget;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;

import java.time.ZoneOffset;

/*
 * FileUploadTransactionService 역할
 *
 * 파일 업로드 완료 과정에서
 * DB 트랜잭션이 필요한 짧은 구간만 담당한다.
 *
 * 1. S3 확인 전 업로드 기록을 짧게 조회한다.
 * 2. S3 확인 후 업로드 row를 잠그고 완료 처리한다.
 *
 * 실제 S3 네트워크 요청은 이 서비스에서 실행하지 않는다.
 */
@Service
public class FileUploadTransactionService {

    private static final ZoneOffset KST_OFFSET =
            ZoneOffset.ofHours(9);

    private final FileUploadRepository fileUploadRepository;

    public FileUploadTransactionService(
            FileUploadRepository fileUploadRepository
    ) {
        this.fileUploadRepository = fileUploadRepository;
    }

    /*
     * S3 확인 전에 업로드 기록과 권한을 확인한다.
     *
     * 조회가 끝나면 DB 트랜잭션도 바로 종료된다.
     */
    @Transactional(readOnly = true)
    public FileUploadCompletionTarget getCompletionTarget(
            Long currentUserId,
            String s3Key,
            FilePurpose purpose
    ) {
        FileUpload upload =
                fileUploadRepository.findByS3Key(s3Key)
                        .orElseThrow(() ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "업로드 기록을 찾을 수 없어."
                                )
                        );

        validateCompletable(
                upload,
                currentUserId,
                purpose
        );

        /*
         * JPA Entity 자체를 트랜잭션 밖으로 넘기지 않고,
         * S3 확인에 필요한 값만 복사해서 반환한다.
         */
        return new FileUploadCompletionTarget(
                upload.getId(),
                upload.getS3Key(),
                upload.getContentType(),
                upload.getSize()
        );
    }

    /*
     * S3 검증이 끝난 파일을 COMPLETED 상태로 변경한다.
     *
     * 같은 파일의 완료 요청이 동시에 들어오면
     * 비관적 잠금으로 한 요청씩 처리한다.
     */
    @Transactional
    public FileCompleteResponse markCompleted(
            Long uploadId,
            Long currentUserId,
            FilePurpose purpose
    ) {
        FileUpload upload =
                fileUploadRepository
                        .findByIdForUpdate(uploadId)
                        .orElseThrow(() ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND,
                                        "업로드 기록을 찾을 수 없어."
                                )
                        );

        /*
         * S3를 확인하는 동안 다른 요청이 먼저
         * COMPLETED 상태로 변경했을 수 있으므로
         * 잠금을 얻은 뒤 모든 조건을 다시 검사한다.
         */
        validateCompletable(
                upload,
                currentUserId,
                purpose
        );

        upload.markCompleted();

        /*
         * @Transactional 안에서 조회한 Entity이므로
         * 별도로 save()를 호출하지 않아도
         * JPA 변경 감지가 UPDATE를 실행한다.
         */
        return new FileCompleteResponse(
                upload.getS3Key(),
                upload.getPurpose(),
                upload.getPublicUrl(),
                upload.getContentType(),
                upload.getSize(),
                upload.getCompletedAt()
                        .atOffset(KST_OFFSET)
        );
    }

    /*
     * 파일 완료 처리에 필요한 공통 조건을 검사한다.
     */
    private void validateCompletable(
            FileUpload upload,
            Long currentUserId,
            FilePurpose purpose
    ) {
        // 다른 사용자가 발급한 업로드 키인지 확인한다.
        if (!upload.getUser()
                .getId()
                .equals(currentUserId)) {

            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "내가 올린 파일만 완료 처리할 수 있어."
            );
        }

        // Presigned URL 발급 목적과 완료 요청 목적을 비교한다.
        if (upload.getPurpose() != purpose) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "파일 목적이 일치하지 않아."
            );
        }

        // PRESIGNED 상태의 파일만 완료 처리할 수 있다.
        if (upload.getStatus()
                != FileUploadStatus.PRESIGNED) {

            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 완료 처리된 파일이야."
            );
        }
    }
}