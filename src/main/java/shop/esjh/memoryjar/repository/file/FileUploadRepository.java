package shop.esjh.memoryjar.repository.file;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;

import java.util.List;
import java.util.Optional;

/*
 * FileUploadRepository 역할
 *
 * Presigned URL 발급부터 실제 쪽지 첨부 연결까지
 * 파일 업로드 진행 기록을 DB에서 조회하고 저장한다.
 */
public interface FileUploadRepository extends JpaRepository<FileUpload, Long> {

    /*
     * s3Key로 업로드 기록과 소유자 정보를 한 번에 조회한다.
     *
     * FileUpload.user는 LAZY 관계이므로
     * JOIN FETCH를 사용해 사용자 정보까지 한 쿼리로 가져온다.
     */
    @Query("""
            SELECT upload
            FROM FileUpload upload
            JOIN FETCH upload.user
            WHERE upload.s3Key = :s3Key
            """)
    Optional<FileUpload> findByS3Key(
            @Param("s3Key") String s3Key
    );

    /*
     * 상태를 COMPLETED로 변경하기 전에
     * 해당 업로드 row를 비관적 쓰기 잠금으로 조회한다.
     *
     * 같은 uploadId의 완료 요청이 동시에 들어와도
     * 먼저 잠금을 얻은 요청만 상태를 변경할 수 있다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT upload
            FROM FileUpload upload
            WHERE upload.id = :uploadId
            """)
    Optional<FileUpload> findByIdForUpdate(
            @Param("uploadId") Long uploadId
    );

    // 같은 사용자의 특정 상태 업로드 기록을 모두 조회한다.
    List<FileUpload> findAllByUser_IdAndStatus(
            Long userId,
            FileUploadStatus status
    );

    /*
     * 사용자, 파일 목적, 상태, s3Key 목록이
     * 모두 일치하는 업로드 기록만 한 번에 조회한다.
     */
    List<FileUpload>
    findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(
            Long userId,
            FilePurpose purpose,
            FileUploadStatus status,
            List<String> s3Keys
    );
}