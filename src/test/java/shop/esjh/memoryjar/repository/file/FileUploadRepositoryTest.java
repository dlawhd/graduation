package shop.esjh.memoryjar.repository.file;

import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FileUploadRepository의 상태별 업로드 조회와 다건 필터 조회를 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class FileUploadRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private FileUploadRepository fileUploadRepository;

    @Test
    @DisplayName("findByS3Key는 s3Key로 업로드 기록을 조회한다")
    void findByS3Key_returnsUpload() {
        User user = saveUser("user-file-find", "user-file-find@example.com", "user");
        saveFileUpload(user, FilePurpose.NOTE, FileUploadStatus.PRESIGNED, "uploads/find-file.png");

        flushAndClear();

        assertThat(fileUploadRepository.findByS3Key("uploads/find-file.png"))
                .isPresent()
                .get()
                .extracting(FileUpload::getS3Key)
                .isEqualTo("uploads/find-file.png");
    }

    @Test
    @DisplayName("findAllByUser_IdAndStatus는 사용자와 상태가 일치하는 업로드만 반환한다")
    void findAllByUserIdAndStatus_returnsUploadsMatchingStatus() {
        User user = saveUser("user-file-status", "user-file-status@example.com", "user");
        saveFileUpload(user, FilePurpose.NOTE, FileUploadStatus.PRESIGNED, "uploads/presigned-1.png");
        saveFileUpload(user, FilePurpose.NOTE, FileUploadStatus.COMPLETED, "uploads/completed-1.png");
        saveFileUpload(user, FilePurpose.PROFILE, FileUploadStatus.PRESIGNED, "uploads/presigned-2.png");

        flushAndClear();

        assertThat(fileUploadRepository.findAllByUser_IdAndStatus(user.getId(), FileUploadStatus.PRESIGNED))
                .extracting(FileUpload::getS3Key)
                .containsExactlyInAnyOrder("uploads/presigned-1.png", "uploads/presigned-2.png");
    }

    @Test
    @DisplayName("findAllByUser_IdAndPurposeAndStatusAndS3KeyIn은 모든 조건이 맞는 업로드만 반환한다")
    void findAllByUserIdAndPurposeAndStatusAndS3KeyIn_filtersByAllConditions() {
        User user = saveUser("user-file-filter", "user-file-filter@example.com", "user");
        saveFileUpload(user, FilePurpose.NOTE, FileUploadStatus.COMPLETED, "uploads/filter-note-1.png");
        saveFileUpload(user, FilePurpose.NOTE, FileUploadStatus.COMPLETED, "uploads/filter-note-2.png");
        saveFileUpload(user, FilePurpose.PROFILE, FileUploadStatus.COMPLETED, "uploads/filter-profile.png");
        saveFileUpload(user, FilePurpose.NOTE, FileUploadStatus.PRESIGNED, "uploads/filter-presigned.png");

        flushAndClear();

        List<FileUpload> result = fileUploadRepository.findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(
                user.getId(),
                FilePurpose.NOTE,
                FileUploadStatus.COMPLETED,
                List.of("uploads/filter-note-1.png", "uploads/filter-profile.png", "uploads/filter-presigned.png")
        );

        assertThat(result).extracting(FileUpload::getS3Key)
                .containsExactly("uploads/filter-note-1.png");
    }
}
