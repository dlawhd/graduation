package shop.esjh.memoryjar.service.file;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.file.request.FileCompleteRequest;
import shop.esjh.memoryjar.dto.file.request.FilePresignRequest;
import shop.esjh.memoryjar.dto.file.response.FileCompleteResponse;
import shop.esjh.memoryjar.dto.file.response.FilePresignResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import shop.esjh.memoryjar.model.file.FileUploadCompletionTarget;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.lang.reflect.Method;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/*
 * FileServiceTest 역할
 *
 * FileService가 파일 업로드 흐름을 정확한 순서로 조정하는지 검증한다.
 *
 * 1. Presigned URL 발급 기록을 PRESIGNED 상태로 저장하는지 확인한다.
 * 2. DB 조회 → S3 확인 → DB 완료 처리 순서를 지키는지 확인한다.
 * 3. S3 검증이나 초기 DB 검증이 실패하면 완료 처리를 실행하지 않는지 확인한다.
 * 4. completeUpload()이 NOT_SUPPORTED 트랜잭션 전파 속성을 사용하는지 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class FileServiceTest {

    private static final Long CURRENT_USER_ID = 1L;
    private static final Long UPLOAD_ID = 100L;
    private static final String S3_KEY = "notes/2026/04/12/uuid.png";
    private static final String PUBLIC_URL =
            "https://cdn.test.com/notes/2026/04/12/uuid.png";
    private static final String CONTENT_TYPE = "image/png";
    private static final Long FILE_SIZE = 1024L;

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

    @Mock
    private FileUploadTransactionService fileUploadTransactionService;

    @InjectMocks
    private FileService fileService;

    @Captor
    private ArgumentCaptor<FileUpload> fileUploadCaptor;

    @Captor
    private ArgumentCaptor<Consumer<HeadObjectRequest.Builder>>
            headObjectConsumerCaptor;

    @Test
    @DisplayName("presign 발급 성공 - 사용자 확인 후 PRESIGNED 업로드 기록을 저장한다")
    void createPresignedUrl_success() {
        // given
        User currentUser = mock(User.class);

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                CONTENT_TYPE,
                FILE_SIZE
        );

        FilePresignResponse presignResponse = new FilePresignResponse(
                "https://upload.test.com",
                S3_KEY,
                PUBLIC_URL,
                OffsetDateTime.of(
                        2026,
                        7,
                        28,
                        13,
                        0,
                        0,
                        0,
                        ZoneOffset.ofHours(9)
                )
        );

        when(userRepository.findById(CURRENT_USER_ID))
                .thenReturn(Optional.of(currentUser));
        when(s3PresignService.createPresignedUrl(request))
                .thenReturn(presignResponse);

        // when
        FilePresignResponse result =
                fileService.createPresignedUrl(
                        CURRENT_USER_ID,
                        request
                );

        // then
        assertThat(result).isEqualTo(presignResponse);

        verify(fileUploadRepository)
                .save(fileUploadCaptor.capture());

        FileUpload savedUpload = fileUploadCaptor.getValue();

        assertThat(savedUpload.getUser()).isEqualTo(currentUser);
        assertThat(savedUpload.getPurpose()).isEqualTo(FilePurpose.NOTE);
        assertThat(savedUpload.getStatus())
                .isEqualTo(FileUploadStatus.PRESIGNED);
        assertThat(savedUpload.getS3Key()).isEqualTo(S3_KEY);
        assertThat(savedUpload.getPublicUrl()).isEqualTo(PUBLIC_URL);
        assertThat(savedUpload.getContentType()).isEqualTo(CONTENT_TYPE);
        assertThat(savedUpload.getSize()).isEqualTo(FILE_SIZE);
    }

    @Test
    @DisplayName("presign 발급 실패 - 사용자가 없으면 404이고 S3 URL을 발급하지 않는다")
    void createPresignedUrl_fail_userNotFound() {
        // given
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                CONTENT_TYPE,
                FILE_SIZE
        );

        when(userRepository.findById(CURRENT_USER_ID))
                .thenReturn(Optional.empty());

        // when
        ResponseStatusException exception = catchThrowableOfType(
                ResponseStatusException.class,
                () -> fileService.createPresignedUrl(
                        CURRENT_USER_ID,
                        request
                )
        );

        // then
        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(exception.getReason())
                .isEqualTo("사용자를 찾을 수 없어.");

        verify(s3PresignService, never())
                .createPresignedUrl(any(FilePresignRequest.class));
        verify(fileUploadRepository, never())
                .save(any(FileUpload.class));
    }

    @Test
    @DisplayName("트랜잭션 설정 - completeUpload는 바깥 트랜잭션을 중단한다")
    void completeUpload_usesNotSupportedPropagation() throws Exception {
        // given
        Method method = FileService.class.getMethod(
                "completeUpload",
                Long.class,
                FileCompleteRequest.class
        );

        // when
        Transactional transactional =
                method.getAnnotation(Transactional.class);

        // then
        assertThat(transactional).isNotNull();
        assertThat(transactional.propagation())
                .isEqualTo(Propagation.NOT_SUPPORTED);
    }

    @Test
    @DisplayName("업로드 완료 성공 - DB 조회, S3 확인, DB 완료 처리를 순서대로 실행한다")
    void completeUpload_success() {
        // given
        FileCompleteRequest request = completeRequest();
        FileUploadCompletionTarget target = completionTarget();
        FileCompleteResponse expectedResponse = completeResponse();

        when(s3Properties.getBucket())
                .thenReturn("test-bucket");
        when(fileUploadTransactionService.getCompletionTarget(
                CURRENT_USER_ID,
                request.s3Key(),
                request.purpose()
        )).thenReturn(target);
        when(s3Client.headObject(anyHeadObjectConsumer()))
                .thenReturn(headObjectResponse(
                        FILE_SIZE,
                        CONTENT_TYPE
                ));
        when(fileUploadTransactionService.markCompleted(
                target.uploadId(),
                CURRENT_USER_ID,
                request.purpose()
        )).thenReturn(expectedResponse);

        // when
        FileCompleteResponse response =
                fileService.completeUpload(
                        CURRENT_USER_ID,
                        request
                );

        // then
        assertThat(response).isEqualTo(expectedResponse);

        /*
         * 반드시 다음 순서여야 한다.
         *
         * 1. 짧은 DB 조회
         * 2. 트랜잭션 밖 S3 확인
         * 3. 짧은 DB 완료 처리
         */
        InOrder inOrder =
                inOrder(fileUploadTransactionService, s3Client);

        inOrder.verify(fileUploadTransactionService)
                .getCompletionTarget(
                        CURRENT_USER_ID,
                        request.s3Key(),
                        request.purpose()
                );
        inOrder.verify(s3Client)
                .headObject(headObjectConsumerCaptor.capture());
        inOrder.verify(fileUploadTransactionService)
                .markCompleted(
                        target.uploadId(),
                        CURRENT_USER_ID,
                        request.purpose()
                );

        // S3 요청 lambda가 올바른 버킷과 s3Key를 넣는지도 확인한다.
        HeadObjectRequest.Builder requestBuilder =
                HeadObjectRequest.builder();
        headObjectConsumerCaptor.getValue()
                .accept(requestBuilder);

        HeadObjectRequest actualHeadRequest =
                requestBuilder.build();

        assertThat(actualHeadRequest.bucket())
                .isEqualTo("test-bucket");
        assertThat(actualHeadRequest.key())
                .isEqualTo(S3_KEY);
    }

    @ParameterizedTest(name = "S3 contentType이 [{0}]이면 타입 검증을 건너뛴다")
    @NullSource
    @ValueSource(strings = {"", "   "})
    @DisplayName("업로드 완료 성공 - S3 contentType이 없으면 타입 검증을 건너뛴다")
    void completeUpload_success_whenS3ContentTypeIsMissing(
            String s3ContentType
    ) {
        // given
        FileCompleteRequest request = completeRequest();
        FileUploadCompletionTarget target = completionTarget();
        FileCompleteResponse expectedResponse = completeResponse();

        when(fileUploadTransactionService.getCompletionTarget(
                CURRENT_USER_ID,
                request.s3Key(),
                request.purpose()
        )).thenReturn(target);
        when(s3Client.headObject(anyHeadObjectConsumer()))
                .thenReturn(headObjectResponse(
                        FILE_SIZE,
                        s3ContentType
                ));
        when(fileUploadTransactionService.markCompleted(
                target.uploadId(),
                CURRENT_USER_ID,
                request.purpose()
        )).thenReturn(expectedResponse);

        // when
        FileCompleteResponse response =
                fileService.completeUpload(
                        CURRENT_USER_ID,
                        request
                );

        // then
        assertThat(response).isEqualTo(expectedResponse);
        verify(fileUploadTransactionService)
                .markCompleted(
                        target.uploadId(),
                        CURRENT_USER_ID,
                        request.purpose()
                );
    }

    @Test
    @DisplayName("업로드 완료 실패 - 초기 DB 검증이 실패하면 S3와 완료 처리를 실행하지 않는다")
    void completeUpload_fail_initialDatabaseValidation() {
        // given
        FileCompleteRequest request = completeRequest();

        when(fileUploadTransactionService.getCompletionTarget(
                CURRENT_USER_ID,
                request.s3Key(),
                request.purpose()
        )).thenThrow(new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "업로드 기록을 찾을 수 없어."
        ));

        // when
        ResponseStatusException exception = catchThrowableOfType(
                ResponseStatusException.class,
                () -> fileService.completeUpload(
                        CURRENT_USER_ID,
                        request
                )
        );

        // then
        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(exception.getReason())
                .isEqualTo("업로드 기록을 찾을 수 없어.");

        verifyNoInteractions(s3Client);
        verify(fileUploadTransactionService, never())
                .markCompleted(
                        anyLong(),
                        anyLong(),
                        any(FilePurpose.class)
                );
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 파일 크기가 다르면 400이고 완료 처리하지 않는다")
    void completeUpload_fail_sizeMismatch() {
        assertS3ValidationFailure(
                headObjectResponse(999L, CONTENT_TYPE),
                HttpStatus.BAD_REQUEST,
                "업로드된 파일 크기가 요청과 달라."
        );
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 파일 크기가 null이면 400이고 완료 처리하지 않는다")
    void completeUpload_fail_sizeNull() {
        assertS3ValidationFailure(
                headObjectResponse(null, CONTENT_TYPE),
                HttpStatus.BAD_REQUEST,
                "업로드된 파일 크기가 요청과 달라."
        );
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 contentType이 다르면 400이고 완료 처리하지 않는다")
    void completeUpload_fail_contentTypeMismatch() {
        assertS3ValidationFailure(
                headObjectResponse(FILE_SIZE, "image/jpeg"),
                HttpStatus.BAD_REQUEST,
                "업로드된 파일 타입이 요청과 달라."
        );
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3에 파일이 없으면 404이고 완료 처리하지 않는다")
    void completeUpload_fail_noSuchKey() {
        assertS3ExceptionFailure(
                NoSuchKeyException.builder()
                        .message("missing")
                        .build(),
                HttpStatus.NOT_FOUND,
                "S3에 업로드된 파일을 찾을 수 없어."
        );
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3가 404를 반환하면 404이고 완료 처리하지 않는다")
    void completeUpload_fail_s3Exception404() {
        assertS3ExceptionFailure(
                S3Exception.builder()
                        .statusCode(404)
                        .message("not found")
                        .build(),
                HttpStatus.NOT_FOUND,
                "S3에 업로드된 파일을 찾을 수 없어."
        );
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 서버 오류면 502이고 완료 처리하지 않는다")
    void completeUpload_fail_s3ServerException() {
        assertS3ExceptionFailure(
                S3Exception.builder()
                        .statusCode(500)
                        .message("server error")
                        .build(),
                HttpStatus.BAD_GATEWAY,
                "S3 파일 확인 중 오류가 발생했어."
        );
    }

    @Test
    @DisplayName("업로드 완료 실패 - S3 연결 또는 타임아웃이면 502이고 완료 처리하지 않는다")
    void completeUpload_fail_s3ClientException() {
        assertS3ExceptionFailure(
                SdkClientException.create("timeout"),
                HttpStatus.BAD_GATEWAY,
                "S3 파일 확인 중 오류가 발생했어."
        );
    }

    /*
     * S3가 정상 응답했지만 파일 메타데이터 검증에 실패하는 상황을 공통 검증한다.
     */
    private void assertS3ValidationFailure(
            HeadObjectResponse headObjectResponse,
            HttpStatus expectedStatus,
            String expectedMessage
    ) {
        FileCompleteRequest request = completeRequest();
        FileUploadCompletionTarget target = completionTarget();

        when(fileUploadTransactionService.getCompletionTarget(
                CURRENT_USER_ID,
                request.s3Key(),
                request.purpose()
        )).thenReturn(target);
        when(s3Client.headObject(anyHeadObjectConsumer()))
                .thenReturn(headObjectResponse);

        ResponseStatusException exception = catchThrowableOfType(
                ResponseStatusException.class,
                () -> fileService.completeUpload(
                        CURRENT_USER_ID,
                        request
                )
        );

        assertThat(exception.getStatusCode())
                .isEqualTo(expectedStatus);
        assertThat(exception.getReason())
                .isEqualTo(expectedMessage);

        verify(fileUploadTransactionService, never())
                .markCompleted(
                        anyLong(),
                        anyLong(),
                        any(FilePurpose.class)
                );
    }

    /*
     * S3 SDK 예외가 발생했을 때 HTTP 상태 변환과 DB 미변경을 공통 검증한다.
     */
    private void assertS3ExceptionFailure(
            RuntimeException s3Exception,
            HttpStatus expectedStatus,
            String expectedMessage
    ) {
        FileCompleteRequest request = completeRequest();
        FileUploadCompletionTarget target = completionTarget();

        when(fileUploadTransactionService.getCompletionTarget(
                CURRENT_USER_ID,
                request.s3Key(),
                request.purpose()
        )).thenReturn(target);
        when(s3Client.headObject(anyHeadObjectConsumer()))
                .thenThrow(s3Exception);

        ResponseStatusException exception = catchThrowableOfType(
                ResponseStatusException.class,
                () -> fileService.completeUpload(
                        CURRENT_USER_ID,
                        request
                )
        );

        assertThat(exception.getStatusCode())
                .isEqualTo(expectedStatus);
        assertThat(exception.getReason())
                .isEqualTo(expectedMessage);

        verify(fileUploadTransactionService, never())
                .markCompleted(
                        anyLong(),
                        anyLong(),
                        any(FilePurpose.class)
                );
    }

    private FileCompleteRequest completeRequest() {
        return new FileCompleteRequest(
                FilePurpose.NOTE,
                S3_KEY
        );
    }

    private FileUploadCompletionTarget completionTarget() {
        return new FileUploadCompletionTarget(
                UPLOAD_ID,
                S3_KEY,
                CONTENT_TYPE,
                FILE_SIZE
        );
    }

    private FileCompleteResponse completeResponse() {
        return new FileCompleteResponse(
                S3_KEY,
                FilePurpose.NOTE,
                PUBLIC_URL,
                CONTENT_TYPE,
                FILE_SIZE,
                OffsetDateTime.of(
                        2026,
                        7,
                        28,
                        13,
                        10,
                        0,
                        0,
                        ZoneOffset.ofHours(9)
                )
        );
    }

    /*
     * 테스트에 사용할 실제 HeadObjectResponse 객체를 만든다.
     *
     * 이 객체를 Mockito mock으로 만들고 내부에서 when()을 호출하면,
     * 바깥의 when(s3Client.headObject(...)).thenReturn(...)과 겹쳐
     * UnfinishedStubbingException이 발생할 수 있다.
     *
     * AWS SDK Builder로 실제 응답 객체를 만들면
     * 중첩 stubbing과 불필요한 stubbing 문제가 모두 사라진다.
     */
    private HeadObjectResponse headObjectResponse(
            Long contentLength,
            String contentType
    ) {
        HeadObjectResponse.Builder builder =
                HeadObjectResponse.builder();

        /*
         * null이면 Builder에 값을 넣지 않는다.
         * 값을 넣지 않은 필드는 완성된 응답에서 null로 조회된다.
         */
        if (contentLength != null) {
            builder.contentLength(contentLength);
        }

        if (contentType != null) {
            builder.contentType(contentType);
        }

        return builder.build();
    }

    /*
     * S3Client.headObject(...)는 오버로딩되어 있으므로
     * Mockito가 Consumer 방식 메서드를 정확히 선택하도록 돕는다.
     */
    @SuppressWarnings("unchecked")
    private Consumer<HeadObjectRequest.Builder>
    anyHeadObjectConsumer() {
        return (Consumer<HeadObjectRequest.Builder>)
                any(Consumer.class);
    }
}