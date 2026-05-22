package shop.esjh.memoryjar.repository.file;

import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FileUploadRepository extends JpaRepository<FileUpload, Long> {

    // s3Key로 업로드 기록 1개 찾기
    Optional<FileUpload> findByS3Key(String s3Key);

    // 같은 사용자가 완료된 업로드 여러 개를 한 번에 찾을 때 사용
    List<FileUpload> findAllByUser_IdAndStatus(Long userId, FileUploadStatus status);

    // 현재 사용자, NOTE 목적, COMPLETED 상태, 요청한 s3Key 목록
    // 조건에 맞는 업로드들만 한 번에 가져온다.
    List<FileUpload> findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(
            Long userId,
            FilePurpose purpose,
            FileUploadStatus status,
            List<String> s3Keys
    );
}