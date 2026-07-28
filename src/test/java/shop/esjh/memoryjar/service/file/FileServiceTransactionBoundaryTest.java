package shop.esjh.memoryjar.service.file;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.file.request.FileCompleteRequest;
import shop.esjh.memoryjar.dto.file.response.FileCompleteResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/*
 * FileServiceTransactionBoundaryTest 역할
 *
 * 실제 Spring 트랜잭션 프록시와 MariaDB를 사용하여
 * S3 headObject()가 실행되는 순간 DB 트랜잭션이 열려 있지 않은지 검증한다.
 *
 * 단순히 @Transactional 설정만 읽는 테스트가 아니라,
 * 실제 실행 흐름에서 트랜잭션이 종료된 뒤 S3가 호출되는지 확인한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(
        replace = AutoConfigureTestDatabase.Replace.NONE
)
@Import({
        JpaAuditConfig.class,
        FileService.class,
        FileUploadTransactionService.class
})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class FileServiceTransactionBoundaryTest
        extends AbstractMariaDbRepositoryTest {

    @Autowired
    private FileService fileService;

    @Autowired
    private FileUploadRepository fileUploadRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    /*
     * FileService 생성자에 필요하지만
     * 이 테스트에서는 Presigned URL 발급 기능을 실행하지 않는다.
     */
    @MockitoBean
    private S3PresignService s3PresignService;

    @MockitoBean
    private S3Client s3Client;

    @MockitoBean
    private S3Properties s3Properties;

    @Test
    @DisplayName("S3 headObject 실행 중에는 실제 DB 트랜잭션이 열려 있지 않다")
    void completeUpload_callsS3OutsideDatabaseTransaction() {
        // given
        TestData testData = createCommittedTestData();

        AtomicBoolean s3Called = new AtomicBoolean(false);
        AtomicReference<HeadObjectRequest> capturedRequest =
                new AtomicReference<>();

        when(s3Properties.getBucket())
                .thenReturn("test-bucket");

        when(s3Client.headObject(anyHeadObjectConsumer()))
                .thenAnswer(invocation -> {
                    /*
                     * 이 callback은 FileService가 실제로
                     * S3 headObject를 호출하는 정확한 순간에 실행된다.
                     */
                    s3Called.set(true);

                    assertThat(
                            TransactionSynchronizationManager
                                    .isActualTransactionActive()
                    ).as("S3 확인 중 DB 트랜잭션이 열려 있으면 안 된다")
                            .isFalse();

                    /*
                     * Mockito mock은 Consumer lambda를 자동 실행하지 않으므로
                     * 실제 AWS SDK처럼 builder에 직접 적용해 요청도 검증한다.
                     */
                    Consumer<HeadObjectRequest.Builder> requestCustomizer =
                            invocation.getArgument(0);

                    HeadObjectRequest.Builder builder =
                            HeadObjectRequest.builder();
                    requestCustomizer.accept(builder);
                    capturedRequest.set(builder.build());

                    return HeadObjectResponse.builder()
                            .contentLength(1024L)
                            .contentType("image/png")
                            .build();
                });

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                testData.s3Key()
        );

        // 테스트 메서드 자체에도 트랜잭션이 없어야 한다.
        assertThat(
                TransactionSynchronizationManager
                        .isActualTransactionActive()
        ).isFalse();

        // when
        FileCompleteResponse response =
                fileService.completeUpload(
                        testData.userId(),
                        request
                );

        // then
        assertThat(s3Called.get()).isTrue();

        HeadObjectRequest actualRequest =
                capturedRequest.get();

        assertThat(actualRequest).isNotNull();
        assertThat(actualRequest.bucket())
                .isEqualTo("test-bucket");
        assertThat(actualRequest.key())
                .isEqualTo(testData.s3Key());

        assertThat(response.s3Key())
                .isEqualTo(testData.s3Key());
        assertThat(response.purpose())
                .isEqualTo(FilePurpose.NOTE);
        assertThat(response.contentType())
                .isEqualTo("image/png");
        assertThat(response.size())
                .isEqualTo(1024L);
        assertThat(response.completedAt())
                .isNotNull();

        FinalUploadState finalState =
                readFinalUploadState(testData.uploadId());

        assertThat(finalState.status())
                .isEqualTo(FileUploadStatus.COMPLETED);
        assertThat(finalState.completedAt())
                .isNotNull();

        // 메서드가 끝난 뒤에도 테스트 스레드에 트랜잭션이 남으면 안 된다.
        assertThat(
                TransactionSynchronizationManager
                        .isActualTransactionActive()
        ).isFalse();

        verify(s3Client)
                .headObject(anyHeadObjectConsumer());
    }

    /*
     * 동시성이나 트랜잭션 경계 테스트에서는
     * 다른 트랜잭션이 데이터를 볼 수 있도록 먼저 커밋해야 한다.
     */
    private TestData createCommittedTestData() {
        TransactionTemplate transactionTemplate =
                new TransactionTemplate(transactionManager);

        TestData testData = transactionTemplate.execute(status -> {
            String unique =
                    String.valueOf(System.nanoTime());
            String s3Key =
                    "uploads/transaction-boundary-"
                            + unique
                            + ".png";

            User user = saveUser(
                    "file-boundary-user-" + unique,
                    "file-boundary-" + unique + "@example.com",
                    "트랜잭션 경계 사용자"
            );

            FileUpload upload = saveFileUpload(
                    user,
                    FilePurpose.NOTE,
                    FileUploadStatus.PRESIGNED,
                    s3Key
            );

            return new TestData(
                    user.getId(),
                    upload.getId(),
                    s3Key
            );
        });

        return Objects.requireNonNull(testData);
    }

    /*
     * 완료 요청이 끝난 뒤 새 트랜잭션에서 최신 DB 값을 읽는다.
     * Entity 자체를 트랜잭션 밖으로 넘기지 않고 필요한 값만 복사한다.
     */
    private FinalUploadState readFinalUploadState(
            Long uploadId
    ) {
        TransactionTemplate transactionTemplate =
                new TransactionTemplate(transactionManager);
        transactionTemplate.setReadOnly(true);

        FinalUploadState finalState =
                transactionTemplate.execute(status -> {
                    FileUpload upload = fileUploadRepository
                            .findById(uploadId)
                            .orElseThrow();

                    return new FinalUploadState(
                            upload.getStatus(),
                            upload.getCompletedAt()
                    );
                });

        return Objects.requireNonNull(finalState);
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

    private record TestData(
            Long userId,
            Long uploadId,
            String s3Key
    ) {
    }

    private record FinalUploadState(
            FileUploadStatus status,
            LocalDateTime completedAt
    ) {
    }
}