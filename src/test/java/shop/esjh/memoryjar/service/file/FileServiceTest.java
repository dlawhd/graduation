package shop.esjh.memoryjar.service.file;

import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.file.request.FileCompleteRequest;
import shop.esjh.memoryjar.dto.file.request.FilePresignRequest;
import shop.esjh.memoryjar.dto.file.response.FileCompleteResponse;
import shop.esjh.memoryjar.dto.file.response.FilePresignResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.time.ZoneOffset;
import java.util.Optional;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/*
 이 테스트 클래스는 FileService가
 1) presign 발급 후 업로드 대기 기록을 잘 저장하는지
 2) complete 시 소유자/목적/상태/S3 파일 정보를 잘 검증하는지
 확인하는 역할을 해.
 */
@ExtendWith(MockitoExtension.class)
class FileServiceTest {

    @Mock
    private S3PresignService s3PresignService;

    @Mock
    private S3Client s3Client;

    @Mock
    private S3Properties s3Properties;

    @Mock
    private UserRepository userRepository;

    @Mock
    private FileUploadRepository fileUploadRepository;

    @InjectMocks
    private FileService fileService;

    @Captor
    private ArgumentCaptor<FileUpload> fileUploadCaptor;

    @Test
    @DisplayName("presign 발급 성공 - 사용자 확인 후 PRESIGNED 업로드 기록을 저장한다")
    void createPresignedUrl_success() {
        // given
        Long currentUserId = 1L;
        User currentUser = mock(User.class);

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                1024L
        );

        FilePresignResponse presignResponse = new FilePresignResponse(
                "https://upload.test.com",
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                null
        );

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(s3PresignService.createPresignedUrl(request)).thenReturn(presignResponse);

        // when
        FilePresignResponse result = fileService.createPresignedUrl(currentUserId, request);

        // then
        assertThat(result).isEqualTo(presignResponse);

        verify(fileUploadRepository).save(fileUploadCaptor.capture());
        FileUpload savedUpload = fileUploadCaptor.getValue();

        assertThat(savedUpload.getUser()).isEqualTo(currentUser);
        assertThat(savedUpload.getPurpose()).isEqualTo(FilePurpose.NOTE);
        assertThat(savedUpload.getStatus()).isEqualTo(FileUploadStatus.PRESIGNED);
        assertThat(savedUpload.getS3Key()).isEqualTo("notes/2026/04/12/uuid.png");
        assertThat(savedUpload.getPublicUrl()).isEqualTo("https://cdn.test.com/notes/2026/04/12/uuid.png");
        assertThat(savedUpload.getContentType()).isEqualTo("image/png");
        assertThat(savedUpload.getSize()).isEqualTo(1024L);
    }

    @Test
    @DisplayName("presign 발급 실패 - 사용자가 없으면 404")
    void createPresignedUrl_fail_userNotFound() {
        // given
        Long currentUserId = 999L;

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                1024L
        );

        when(userRepository.findById(currentUserId)).thenReturn(Optional.empty());

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.createPresignedUrl(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex).isNotNull();
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ex.getReason()).isEqualTo("사용자를 찾을 수 없어.");

        verify(s3PresignService, never()).createPresignedUrl(any());
        verify(fileUploadRepository, never()).save(any());
    }

    @Test
    @DisplayName("업로드 완료 성공 - 모든 검증을 통과하면 COMPLETED 처리하고 응답을 반환한다")
    void completeUpload_success() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                "image/png",
                1024L
        );

        HeadObjectResponse headObjectResponse = HeadObjectResponse.builder()
                .contentLength(1024L)
                .contentType("image/png")
                .build();

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));
        when(s3Client.headObject(anyHeadObjectConsumer())).thenReturn(headObjectResponse);

        // when
        FileCompleteResponse response = fileService.completeUpload(currentUserId, request);

        // then
        assertThat(response.s3Key()).isEqualTo("notes/2026/04/12/uuid.png");
        assertThat(response.purpose()).isEqualTo(FilePurpose.NOTE);
        assertThat(response.publicUrl()).isEqualTo("https://cdn.test.com/notes/2026/04/12/uuid.png");
        assertThat(response.contentType()).isEqualTo("image/png");
        assertThat(response.size()).isEqualTo(1024L);
        assertThat(response.completedAt()).isNotNull();
        assertThat(response.completedAt().getOffset()).isEqualTo(ZoneOffset.ofHours(9));

        assertThat(upload.getStatus()).isEqualTo(FileUploadStatus.COMPLETED);
        assertThat(upload.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("업로드 완료 성공 - S3 contentType이 null이면 타입 검증은 건너뛴다")
    void completeUpload_success_whenS3ContentTypeIsNull() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                "image/png",
                1024L
        );

        HeadObjectResponse headObjectResponse = HeadObjectResponse.builder()
                .contentLength(1024L)
                .contentType(null)
                .build();

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));
        when(s3Client.headObject(anyHeadObjectConsumer())).thenReturn(headObjectResponse);

        // when
        FileCompleteResponse response = fileService.completeUpload(currentUserId, request);

        // then
        assertThat(response).isNotNull();
        assertThat(upload.getStatus()).isEqualTo(FileUploadStatus.COMPLETED);
    }

    @Test
    @DisplayName("업로드 완료 실패 - 업로드 기록이 없으면 404")
    void completeUpload_fail_uploadNotFound() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.empty());

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ex.getReason()).isEqualTo("업로드 기록을 찾을 수 없어.");

        verify(s3Client, never()).headObject(anyHeadObjectConsumer());
    }

    @Test
    @DisplayName("업로드 완료 실패 - 다른 사용자의 파일이면 403")
    void completeUpload_fail_otherUsersFile() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                2L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                "image/png",
                1024L
        );

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(ex.getReason()).isEqualTo("내가 올린 파일만 완료 처리할 수 있어.");

        verify(s3Client, never()).headObject(anyHeadObjectConsumer());
    }

    @Test
    @DisplayName("업로드 완료 실패 - purpose가 다르면 400")
    void completeUpload_fail_purposeMismatch() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.PROFILE, // request는 PROFILE
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE, // upload는 NOTE
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                "image/png",
                1024L
        );

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("파일 목적이 일치하지 않아.");

        verify(s3Client, never()).headObject(anyHeadObjectConsumer());
    }

    @Test
    @DisplayName("업로드 완료 실패 - 이미 COMPLETED 상태면 409")
    void completeUpload_fail_alreadyCompleted() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.COMPLETED,
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                "image/png",
                1024L
        );

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ex.getReason()).isEqualTo("이미 완료 처리된 파일이야.");

        verify(s3Client, never()).headObject(anyHeadObjectConsumer());
    }

    @Test
    @DisplayName("업로드 완료 실패 - 이미 CONSUMED 상태면 409")
    void completeUpload_fail_alreadyConsumed() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.CONSUMED,
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                "image/png",
                1024L
        );

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ex.getReason()).isEqualTo("이미 완료 처리된 파일이야.");

        verify(s3Client, never()).headObject(anyHeadObjectConsumer());
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 파일 크기가 다르면 400")
    void completeUpload_fail_sizeMismatch() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                "image/png",
                1024L
        );

        HeadObjectResponse headObjectResponse = HeadObjectResponse.builder()
                .contentLength(999L)
                .contentType("image/png")
                .build();

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));
        when(s3Client.headObject(anyHeadObjectConsumer())).thenReturn(headObjectResponse);

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("업로드된 파일 크기가 요청과 달라.");
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 파일 크기가 null이면 400")
    void completeUpload_fail_sizeNull() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                "image/png",
                1024L
        );

        HeadObjectResponse headObjectResponse = HeadObjectResponse.builder()
                .contentLength(null)
                .contentType("image/png")
                .build();

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));
        when(s3Client.headObject(anyHeadObjectConsumer())).thenReturn(headObjectResponse);

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("업로드된 파일 크기가 요청과 달라.");
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 contentType이 다르면 400")
    void completeUpload_fail_contentTypeMismatch() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/uuid.png",
                "https://cdn.test.com/notes/2026/04/12/uuid.png",
                "image/png",
                1024L
        );

        HeadObjectResponse headObjectResponse = HeadObjectResponse.builder()
                .contentLength(1024L)
                .contentType("image/jpeg")
                .build();

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));
        when(s3Client.headObject(anyHeadObjectConsumer())).thenReturn(headObjectResponse);

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("업로드된 파일 타입이 요청과 달라.");
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3에 파일이 없으면 404")
    void completeUpload_fail_s3NoSuchKey() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/missing.png",
                "https://cdn.test.com/notes/2026/04/12/missing.png",
                "image/png",
                1024L
        );

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));
        when(s3Client.headObject(anyHeadObjectConsumer()))
                .thenThrow(NoSuchKeyException.builder().message("missing").build());

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ex.getReason()).isEqualTo("S3에 업로드된 파일을 찾을 수 없어.");
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 404 예외면 404")
    void completeUpload_fail_s3Exception404() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/missing.png",
                "https://cdn.test.com/notes/2026/04/12/missing.png",
                "image/png",
                1024L
        );

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));
        when(s3Client.headObject(anyHeadObjectConsumer()))
                .thenThrow((S3Exception) S3Exception.builder().statusCode(404).message("not found").build());

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ex.getReason()).isEqualTo("S3에 업로드된 파일을 찾을 수 없어.");
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 기타 예외면 502")
    void completeUpload_fail_s3ExceptionOther() {
        // given
        Long currentUserId = 1L;

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                "notes/2026/04/12/uuid.png"
        );

        FileUpload upload = createUploadEntity(
                1L,
                FilePurpose.NOTE,
                FileUploadStatus.PRESIGNED,
                "notes/2026/04/12/error.png",
                "https://cdn.test.com/notes/2026/04/12/error.png",
                "image/png",
                1024L
        );

        when(fileUploadRepository.findByS3Key(request.s3Key())).thenReturn(Optional.of(upload));
        when(s3Client.headObject(anyHeadObjectConsumer()))
                .thenThrow((S3Exception) S3Exception.builder().statusCode(500).message("boom").build());

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> fileService.completeUpload(currentUserId, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(ex.getReason()).isEqualTo("S3 파일 확인 중 오류가 발생했어.");
    }

    /*
     이 함수는 테스트용 사용자 mock을 만드는 역할이야.
     FileService에서는 userId 비교만 중요해서 id만 준비해도 충분해.
     */
    private User createUserMock(Long userId) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(userId);
        return user;
    }

    /*
     이 함수는 테스트용 FileUpload 엔티티를 만드는 역할이야.
     completeUpload 테스트에서는 markCompleted()가 실제로 동작해야 해서
     mock 대신 진짜 엔티티를 만들어 쓰는 방식이 더 안전해.
     */
    private FileUpload createUploadEntity(
            Long ownerId,
            FilePurpose purpose,
            FileUploadStatus status,
            String s3Key,
            String publicUrl,
            String contentType,
            Long size
    ) {
        User owner = createUserMock(ownerId);

        FileUpload upload = FileUpload.builder()
                .user(owner)
                .purpose(purpose)
                .status(status)
                .s3Key(s3Key)
                .publicUrl(publicUrl)
                .contentType(contentType)
                .size(size)
                .build();

        // 혹시 엔티티 내부에서 completedAt 같은 값 확인이 필요할 수 있어서
        // 상태에 따라 기본 시간도 넣어줄 수 있게 처리했어.
        if (status == FileUploadStatus.COMPLETED || status == FileUploadStatus.CONSUMED) {
            ReflectionTestUtils.setField(upload, "completedAt", java.time.LocalDateTime.now());
        }

        return upload;
    }

    /*
     S3Client.headObject(...)는 오버로딩이 있어서
     Consumer 타입을 명확하게 알려주는 helper를 쓰는 게 컴파일 에러를 줄여줘.
     */
    @SuppressWarnings("unchecked")
    private Consumer<HeadObjectRequest.Builder> anyHeadObjectConsumer() {
        return (Consumer<HeadObjectRequest.Builder>) any(Consumer.class);
    }
}