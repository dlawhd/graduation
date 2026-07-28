package shop.esjh.memoryjar.service.file;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.file.response.FileCompleteResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/*
 * FileUploadTransactionServiceTest 역할
 *
 * 파일 업로드 완료 과정의 마지막 DB 처리를 검증한다.
 *
 * 1. 잠금 조회 후 파일이 COMPLETED 상태로 변경되는지 확인한다.
 * 2. 다른 요청이 먼저 완료한 파일은 다시 완료되지 않는지 확인한다.
 * 3. JPA 변경 감지를 사용하므로 save()를 직접 호출하지 않는지 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class FileUploadTransactionServiceTest {

    @Mock
    private FileUploadRepository fileUploadRepository;

    @InjectMocks
    private FileUploadTransactionService fileUploadTransactionService;

    @Test
    @DisplayName("최종 완료 성공 - 잠금 조회 후 COMPLETED 상태와 응답을 만든다")
    void markCompleted_success() {
        // given
        FileUpload upload = createUpload(
                100L,
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED
        );

        /*
         * 같은 업로드 기록을 잠금 조회했을 때
         * 준비한 테스트 엔티티가 반환되도록 설정한다.
         */
        when(fileUploadRepository.findByIdForUpdate(100L))
                .thenReturn(Optional.of(upload));

        // when
        FileCompleteResponse response =
                fileUploadTransactionService.markCompleted(
                        100L,
                        1L,
                        FilePurpose.NOTE
                );

        // then
        // 업로드 상태가 PRESIGNED에서 COMPLETED로 변경되어야 한다.
        assertThat(upload.getStatus())
                .isEqualTo(FileUploadStatus.COMPLETED);

        // 실제 완료 처리 시각이 기록되어야 한다.
        assertThat(upload.getCompletedAt())
                .isNotNull();

        // 응답에는 완료된 업로드 정보가 들어가야 한다.
        assertThat(response.s3Key())
                .isEqualTo(upload.getS3Key());

        assertThat(response.purpose())
                .isEqualTo(FilePurpose.NOTE);

        assertThat(response.publicUrl())
                .isEqualTo(upload.getPublicUrl());

        assertThat(response.contentType())
                .isEqualTo(upload.getContentType());

        assertThat(response.size())
                .isEqualTo(upload.getSize());

        assertThat(response.completedAt().getOffset())
                .isEqualTo(ZoneOffset.ofHours(9));

        // 비관적 잠금 조회가 실제로 호출되었는지 확인한다.
        verify(fileUploadRepository)
                .findByIdForUpdate(100L);

        /*
         * markCompleted()는 @Transactional 안에서 관리되는 Entity를 변경한다.
         *
         * 실제 운영에서는 JPA 변경 감지가 UPDATE를 실행하므로
         * Repository save()를 직접 호출할 필요가 없다.
         */
        verify(fileUploadRepository, never())
                .save(any(FileUpload.class));
    }

    @Test
    @DisplayName("최종 완료 실패 - 잠금을 기다리는 동안 다른 요청이 먼저 완료했으면 409")
    void markCompleted_fail_completedByAnotherRequest() {
        // given
        /*
         * 다른 요청이 먼저 완료했다고 가정하여
         * 처음부터 COMPLETED 상태인 업로드를 준비한다.
         */
        FileUpload upload = createUpload(
                100L,
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.COMPLETED
        );

        when(fileUploadRepository.findByIdForUpdate(100L))
                .thenReturn(Optional.of(upload));

        // when
        ResponseStatusException exception =
                catchThrowableOfType(
                        () -> fileUploadTransactionService.markCompleted(
                                100L,
                                1L,
                                FilePurpose.NOTE
                        ),
                        ResponseStatusException.class
                );

        // then
        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);

        assertThat(exception.getReason())
                .isEqualTo("이미 완료 처리된 파일이야.");

        // 기존 COMPLETED 상태가 그대로 유지되어야 한다.
        assertThat(upload.getStatus())
                .isEqualTo(FileUploadStatus.COMPLETED);

        // 잠금 조회는 정상적으로 실행되어야 한다.
        verify(fileUploadRepository)
                .findByIdForUpdate(100L);

        // 이미 완료된 파일이므로 다시 저장하지 않는다.
        verify(fileUploadRepository, never())
                .save(any(FileUpload.class));
    }

    /*
     * 테스트에 사용할 실제 FileUpload 엔티티를 만든다.
     *
     * FileUpload의 markCompleted()가 실제로 상태를 변경하는지 확인해야 하므로
     * FileUpload 자체는 Mockito Mock이 아니라 진짜 객체를 사용한다.
     */
    private FileUpload createUpload(
            Long uploadId,
            Long ownerId,
            FilePurpose purpose,
            FileUploadStatus status
    ) {
        /*
         * 이번 테스트에서는 User 전체 정보가 필요하지 않고
         * 파일 소유자의 ID만 필요하다.
         */
        User owner = mock(User.class);

        when(owner.getId())
                .thenReturn(ownerId);

        FileUpload upload = FileUpload.builder()
                .user(owner)
                .purpose(purpose)
                .status(status)
                .s3Key("notes/2026/04/12/uuid.png")
                .publicUrl(
                        "https://cdn.test.com/notes/2026/04/12/uuid.png"
                )
                .contentType("image/png")
                .size(1024L)
                .build();

        /*
         * FileUpload ID는 DB에서 자동 생성되므로
         * Builder로 직접 넣을 수 없다.
         *
         * 테스트에서는 ReflectionTestUtils를 사용해
         * DB가 발급했다고 가정한 ID를 넣는다.
         */
        ReflectionTestUtils.setField(
                upload,
                "id",
                uploadId
        );

        /*
         * 이미 완료된 상태를 표현할 때는
         * completedAt도 함께 넣어 실제 DB 상태와 비슷하게 만든다.
         */
        if (status == FileUploadStatus.COMPLETED
                || status == FileUploadStatus.CONSUMED) {

            ReflectionTestUtils.setField(
                    upload,
                    "completedAt",
                    LocalDateTime.now()
            );
        }

        return upload;
    }
}