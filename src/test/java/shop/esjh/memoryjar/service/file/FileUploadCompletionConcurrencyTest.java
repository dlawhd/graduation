package shop.esjh.memoryjar.service.file;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.file.request.FileCompleteRequest;
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
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/*
 * FileUploadCompletionConcurrencyTest 역할
 *
 * 같은 s3Key에 완료 요청 두 개가 거의 동시에 들어왔을 때
 * 실제 MariaDB 비관적 잠금이 중복 완료 처리를 막는지 검증한다.
 *
 * 두 요청 모두 다음 과정을 실제로 거친다.
 *
 * 1. 짧은 DB 조회
 * 2. 트랜잭션 밖 S3 확인
 * 3. 비관적 잠금 DB 완료 처리
 *
 * 최종 결과는 반드시 성공 1개와 409 충돌 1개여야 한다.
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
class FileUploadCompletionConcurrencyTest
        extends AbstractMariaDbRepositoryTest {

    private static final int CONCURRENT_REQUEST_COUNT = 2;

    @Autowired
    private FileService fileService;

    @Autowired
    private FileUploadRepository fileUploadRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private S3PresignService s3PresignService;

    @MockitoBean
    private S3Client s3Client;

    @MockitoBean
    private S3Properties s3Properties;

    @Test
    @DisplayName("같은 파일 완료 요청 두 개가 동시에 들어오면 하나만 성공하고 하나는 409가 된다")
    void concurrentCompleteUpload_allowsOnlyOneSuccess()
            throws Exception {
        // given
        TestData testData = createCommittedTestData();

        FileCompleteRequest request = new FileCompleteRequest(
                FilePurpose.NOTE,
                testData.s3Key()
        );

        /*
         * 두 요청이 모두 S3 확인 단계까지 도착한 뒤에만
         * S3 응답을 돌려준다.
         *
         * 이렇게 해야 두 요청이 모두 초기 PRESIGNED 상태를 확인한 뒤
         * 최종 잠금 단계에서 경쟁하게 되어 동시성 상황을 확실하게 만든다.
         */
        CountDownLatch s3ArrivalLatch =
                new CountDownLatch(CONCURRENT_REQUEST_COUNT);

        when(s3Properties.getBucket())
                .thenReturn("test-bucket");

        when(s3Client.headObject(anyHeadObjectConsumer()))
                .thenAnswer(invocation -> {
                    Consumer<HeadObjectRequest.Builder> requestCustomizer =
                            invocation.getArgument(0);

                    HeadObjectRequest.Builder builder =
                            HeadObjectRequest.builder();
                    requestCustomizer.accept(builder);
                    HeadObjectRequest actualRequest =
                            builder.build();

                    if (!"test-bucket".equals(actualRequest.bucket())
                            || !testData.s3Key().equals(actualRequest.key())) {
                        throw new IllegalStateException(
                                "S3 headObject 요청의 bucket 또는 s3Key가 잘못됐어."
                        );
                    }

                    s3ArrivalLatch.countDown();

                    boolean bothRequestsReachedS3 =
                            s3ArrivalLatch.await(
                                    10,
                                    TimeUnit.SECONDS
                            );

                    if (!bothRequestsReachedS3) {
                        throw new IllegalStateException(
                                "두 완료 요청이 모두 S3 확인 단계에 도착하지 못했어."
                        );
                    }

                    return HeadObjectResponse.builder()
                            .contentLength(1024L)
                            .contentType("image/png")
                            .build();
                });

        ExecutorService executor =
                Executors.newFixedThreadPool(
                        CONCURRENT_REQUEST_COUNT
                );

        CountDownLatch readyLatch =
                new CountDownLatch(CONCURRENT_REQUEST_COUNT);
        CountDownLatch startLatch =
                new CountDownLatch(1);

        try {
            Future<CompletionResult> firstFuture =
                    executor.submit(() -> {
                        readyLatch.countDown();
                        startLatch.await();

                        return completeOnce(
                                testData.userId(),
                                request
                        );
                    });

            Future<CompletionResult> secondFuture =
                    executor.submit(() -> {
                        readyLatch.countDown();
                        startLatch.await();

                        return completeOnce(
                                testData.userId(),
                                request
                        );
                    });

            // 두 작업 스레드가 모두 출발 준비를 마칠 때까지 기다린다.
            assertThat(
                    readyLatch.await(
                            10,
                            TimeUnit.SECONDS
                    )
            ).as("두 완료 요청이 제한 시간 안에 준비되어야 한다")
                    .isTrue();

            // 두 요청을 거의 동시에 출발시킨다.
            startLatch.countDown();

            CompletionResult firstResult =
                    firstFuture.get(
                            20,
                            TimeUnit.SECONDS
                    );
            CompletionResult secondResult =
                    secondFuture.get(
                            20,
                            TimeUnit.SECONDS
                    );

            /*
             * 어느 스레드가 먼저 잠금을 잡을지는 정해져 있지 않다.
             * 따라서 순서와 관계없이 성공 1개, 충돌 1개인지 확인한다.
             */
            assertThat(List.of(firstResult, secondResult))
                    .containsExactlyInAnyOrder(
                            CompletionResult.SUCCESS,
                            CompletionResult.CONFLICT
                    );

        } finally {
            // 중간 실패가 발생해도 대기 중인 스레드를 풀어준다.
            startLatch.countDown();
            executor.shutdownNow();
            executor.awaitTermination(
                    5,
                    TimeUnit.SECONDS
            );
        }

        /*
         * 두 요청 모두 초기 검증과 S3 확인까지는 통과해야
         * 최종 잠금 단계의 경쟁을 검증할 수 있다.
         */
        verify(s3Client, times(CONCURRENT_REQUEST_COUNT))
                .headObject(anyHeadObjectConsumer());

        FinalUploadState finalState =
                readFinalUploadState(testData.uploadId());

        assertThat(finalState.status())
                .isEqualTo(FileUploadStatus.COMPLETED);
        assertThat(finalState.completedAt())
                .isNotNull();
    }

    /*
     * 실제 FileService 완료 API 흐름을 한 번 실행한다.
     *
     * 첫 번째 요청은 성공하고,
     * 두 번째 요청은 잠금 획득 후 최신 COMPLETED 상태를 읽어 409가 된다.
     */
    private CompletionResult completeOnce(
            Long userId,
            FileCompleteRequest request
    ) {
        try {
            fileService.completeUpload(userId, request);
            return CompletionResult.SUCCESS;

        } catch (ResponseStatusException exception) {
            if (exception.getStatusCode().value()
                    == HttpStatus.CONFLICT.value()) {
                return CompletionResult.CONFLICT;
            }

            // 409 외의 오류는 예상하지 않은 실패이므로 테스트를 실패시킨다.
            throw exception;
        }
    }

    /*
     * 작업 스레드가 조회할 수 있도록
     * 사용자와 PRESIGNED 업로드 기록을 먼저 저장하고 커밋한다.
     */
    private TestData createCommittedTestData() {
        TransactionTemplate transactionTemplate =
                new TransactionTemplate(transactionManager);

        TestData testData = transactionTemplate.execute(status -> {
            String unique =
                    String.valueOf(System.nanoTime());
            String s3Key =
                    "uploads/concurrent-"
                            + unique
                            + ".png";

            User user = saveUser(
                    "file-complete-user-" + unique,
                    "file-complete-" + unique + "@example.com",
                    "파일 완료 사용자"
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
     * 모든 동시 요청이 끝난 후
     * 새 읽기 트랜잭션에서 최종 DB 상태를 확인한다.
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

    private enum CompletionResult {
        SUCCESS,
        CONFLICT
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