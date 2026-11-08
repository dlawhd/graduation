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

    @Query(value = """
            SELECT f.upload_id FROM file_uploads f
            WHERE f.purpose='NOTE' AND f.status IN ('COMPLETED','UNUSED_DELETING')
              AND f.unused_cleanup_after <= :now AND f.unused_cleaned_at IS NULL
              AND f.s3_key LIKE 'notes/%' AND f.s3_key NOT LIKE '%.pending'
              AND NOT EXISTS (SELECT 1 FROM note_attachments a WHERE a.s3_key=f.s3_key)
            ORDER BY f.unused_cleanup_after, f.upload_id LIMIT 50
            """, nativeQuery = true)
    List<Long> findUnusedCleanupIds(@Param("now") java.time.LocalDateTime now);

    /** 첨부 연결의 COMPLETED→CONSUMED 갱신과 같은 행을 경합한다. 확보 후에는 새 연결이 실패한다. */
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = """
            UPDATE file_uploads f SET f.status='UNUSED_DELETING', f.unused_cleanup_after=:retryAt, f.updated_at=:now
            WHERE f.upload_id=:id AND f.purpose='NOTE' AND f.status IN ('COMPLETED','UNUSED_DELETING')
              AND f.unused_cleaned_at IS NULL AND f.unused_cleanup_after <= :now
              AND NOT EXISTS (SELECT 1 FROM note_attachments a WHERE a.s3_key=f.s3_key)
            """, nativeQuery = true)
    int claimUnusedCleanup(@Param("id") Long id, @Param("now") java.time.LocalDateTime now,
                           @Param("retryAt") java.time.LocalDateTime retryAt);

    @org.springframework.data.jpa.repository.Modifying
    @Query(value = """
            UPDATE file_uploads SET status='UNUSED_DELETED', unused_cleaned_at=:now, updated_at=:now
            WHERE upload_id=:id AND status='UNUSED_DELETING'
            """, nativeQuery = true)
    int markUnusedCleaned(@Param("id") Long id, @Param("now") java.time.LocalDateTime now);

    /** 중복 연결 검사는 DB에서 원자적으로 수행한다. 겹치는 파일은 항상 같은 키 순서로 잠근다. */
    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true)
    @Query(value = """
            UPDATE file_uploads SET status = 'CONSUMED', consumed_at = :now, updated_at = :now
            WHERE user_id = :userId AND purpose = 'NOTE' AND status = 'COMPLETED'
              AND deleted_at IS NULL AND s3_key IN (:keys)
            ORDER BY s3_key
            """, nativeQuery = true)
    int claimCompletedNoteUploads(@Param("userId") Long userId, @Param("keys") List<String> keys,
                                  @Param("now") java.time.LocalDateTime now);

    // 삭제된 사용자/업로드도 임시 객체가 남을 수 있어 정리 대상은 native 조회로 찾는다.
    @Query(value = """
            SELECT upload_id FROM file_uploads
            WHERE staging_cleaned_at IS NULL AND staging_cleanup_after <= :now
            ORDER BY staging_cleanup_after, upload_id LIMIT 50
            """, nativeQuery = true)
    List<Long> findStagingCleanupIds(@Param("now") java.time.LocalDateTime now);

    @Query(value = "SELECT s3_key FROM file_uploads WHERE upload_id = :id FOR UPDATE", nativeQuery = true)
    Optional<String> findStagingKeyForUpdate(@Param("id") Long id);

    // 먼저 재시도 시각을 옮겨 다른 서버와 중복 실행을 줄이고, 실패한 한 행의 독점을 방지한다.
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = """
            UPDATE file_uploads SET staging_cleanup_after = :retryAt,
              status = CASE WHEN status = 'PRESIGNED' THEN 'EXPIRED' ELSE status END
            WHERE upload_id = :id AND staging_cleaned_at IS NULL AND staging_cleanup_after <= :now
            """, nativeQuery = true)
    int claimStagingCleanup(@Param("id") Long id, @Param("now") java.time.LocalDateTime now,
                            @Param("retryAt") java.time.LocalDateTime retryAt);

    @org.springframework.data.jpa.repository.Modifying
    @Query(value = "UPDATE file_uploads SET staging_cleaned_at = :now WHERE upload_id = :id AND staging_cleaned_at IS NULL", nativeQuery = true)
    int markStagingCleaned(@Param("id") Long id, @Param("now") java.time.LocalDateTime now);

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
