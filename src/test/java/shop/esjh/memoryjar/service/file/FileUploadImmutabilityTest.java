package shop.esjh.memoryjar.service.file;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.file.request.FileCompleteRequest;
import shop.esjh.memoryjar.dto.file.response.FileCompleteResponse;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.model.file.FileUploadCompletionTarget;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 임시 업로드를 다시 쓰거나 완료 요청이 겹쳐도 확정 파일이 바뀌지 않는지 검증한다. 실제 AWS는 호출하지 않는다. */
class FileUploadImmutabilityTest {
    private final UploadedMediaValidator mediaValidator=mock(UploadedMediaValidator.class);
    private final S3Client s3 = mock(S3Client.class);
    private final FileUploadTransactionService transactions = mock(FileUploadTransactionService.class);
    private final S3Properties properties = new S3Properties();
    private final FileCompleteRequest request = new FileCompleteRequest(FilePurpose.NOTE, "notes/test.png");
    private final FileUploadCompletionTarget target = new FileUploadCompletionTarget(7L, request.s3Key(), "image/png", 4L);
    private final FileCompleteResponse receipt = new FileCompleteResponse(request.s3Key(), FilePurpose.NOTE,
            "https://example.invalid/notes/test.png", "image/png", 4L, OffsetDateTime.now());

    private FileService service(S3Client client) {
        return new FileService(mock(S3PresignService.class), client, properties, mock(UserRepository.class),
                transactions, mediaValidator,mock(FileUploadReservationService.class));
    }

    @BeforeEach void fixture() {
        properties.setBucket("fixture-bucket");
        when(transactions.getCompletionTarget(1L, request.s3Key(), FilePurpose.NOTE)).thenReturn(target);
        when(transactions.markCompleted(7L, 1L, FilePurpose.NOTE)).thenReturn(receipt);
        when(s3.headObject(org.mockito.ArgumentMatchers.<Consumer<HeadObjectRequest.Builder>>any()))
                .thenReturn(HeadObjectResponse.builder().contentLength(4L).contentType("image/png").eTag("\"v1\"").build());
    }

    @Test void changedSourceWithoutPublishedFileCannotComplete() {
        when(s3.copyObject(any(CopyObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(412).build());
        when(s3.headObject(org.mockito.ArgumentMatchers.<Consumer<HeadObjectRequest.Builder>>any())).thenAnswer(call -> {
            var builder = HeadObjectRequest.builder();
            call.<Consumer<HeadObjectRequest.Builder>>getArgument(0).accept(builder);
            if (!builder.build().key().endsWith(".pending")) throw S3Exception.builder().statusCode(404).build();
            return HeadObjectResponse.builder().contentLength(4L).contentType("image/png").eTag("\"v1\"").build();
        });
        assertThatThrownBy(() -> service(s3).completeUpload(1L, request)).isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
        verify(transactions, never()).markCompleted(anyLong(), anyLong(), any());
        verify(s3, never()).deleteObject(any(DeleteObjectRequest.class));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints = {409, 403, 503})
    void copyFailureNeverMarksCompleted(int status) {
        when(s3.copyObject(any(CopyObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(status).build());
        assertThatThrownBy(() -> service(s3).completeUpload(1L, request)).isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode().value()).isEqualTo(status == 409 ? 409 : 502));
        verify(transactions, never()).markCompleted(anyLong(), anyLong(), any());
    }

    @Test void copySuccessFollowedByDatabaseFailureKeepsSourceForRetry() {
        when(transactions.markCompleted(7L, 1L, FilePurpose.NOTE)).thenThrow(new IllegalStateException("fixture DB failure"));
        assertThatThrownBy(() -> service(s3).completeUpload(1L, request)).isInstanceOf(IllegalStateException.class);
        verify(s3, never()).deleteObject(any(DeleteObjectRequest.class));
    }

    @Test void sourceCleanupFailureCannotTurnCommittedSuccessIntoFailure() {
        when(s3.deleteObject(any(DeleteObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(503).build());
        assertThat(service(s3).completeUpload(1L, request)).isEqualTo(receipt);
    }

    @Test void realPresignerBindsSizeAndNeverGrantsWriteAccessToPublishedKey() {
        properties.setRegion("us-east-1"); properties.setPresignExpSeconds(300);
        properties.setPublicBaseUrl("https://example.invalid");
        var policy = new shop.esjh.memoryjar.config.properties.FileProperties();
        policy.setAllowedImageTypes(java.util.List.of("image/png")); policy.setMaxSize(10 * 1024 * 1024L);
        try (var signer = software.amazon.awssdk.services.s3.presigner.S3Presigner.builder()
                .region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("fixture", "fixture-secret"))).build()) {
            var response = new S3PresignService(signer, properties, policy).createPresignedUrl(
                    new shop.esjh.memoryjar.dto.file.request.FilePresignRequest(FilePurpose.NOTE, "photo.png", "image/png", 4L));
            var upload = URI.create(response.uploadUrl());
            assertThat(upload.getPath()).endsWith(response.s3Key() + ".pending");
            assertThat(response.publicUrl()).isEqualTo("/api/v1/files/pending");
            String query = URLDecoder.decode(upload.getRawQuery(), StandardCharsets.UTF_8);
            assertThat(query).contains("content-length");
        }
    }

    @Test void wrongExistingDestinationMetadataCannotComplete() {
        when(s3.copyObject(any(CopyObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(412).build());
        when(s3.headObject(org.mockito.ArgumentMatchers.<Consumer<HeadObjectRequest.Builder>>any()))
                .thenReturn(HeadObjectResponse.builder().contentLength(4L).eTag("v1").build(),
                        HeadObjectResponse.builder().contentLength(100L).eTag("v2").build());
        assertThatThrownBy(() -> service(s3).completeUpload(1L, request)).isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode().value()).isEqualTo(400));
        verify(transactions, never()).markCompleted(anyLong(), anyLong(), any());
    }

    @Test void realSdkSignsBothConditionsAndReusedUploadCannotReplacePublishedBytes() throws Exception {
        // 이 로컬 대역은 S3의 원본 버전 검사와 목적지 최초 쓰기 조건을 실제 HTTP 요청에 적용한다.
        var objects = new ConcurrentHashMap<String, String>();
        String pending = "/fixture-bucket/notes/test.png.pending", finalPath = "/fixture-bucket/notes/test.png";
        objects.put(pending, "good");
        var copies = new AtomicInteger();
        var signedConditions = new AtomicInteger();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            int status = 200; String body = "";
            if (exchange.getRequestMethod().equals("HEAD")) {
                String value = objects.get(path);
                if (value == null) status = 404;
                else {
                    exchange.getResponseHeaders().set("Content-Length", "4");
                    exchange.getResponseHeaders().set("Content-Type", "image/png");
                    exchange.getResponseHeaders().set("ETag", "\"" + value + "\"");
                }
            } else if (exchange.getRequestMethod().equals("PUT")) {
                copies.incrementAndGet();
                var h = exchange.getRequestHeaders();
                String authorization = h.getFirst("Authorization");
                if ("*".equals(h.getFirst("If-None-Match")) && authorization != null
                        && authorization.contains("if-none-match") && authorization.contains("x-amz-copy-source-if-match"))
                    signedConditions.incrementAndGet();
                String source = "/" + URLDecoder.decode(h.getFirst("x-amz-copy-source"), StandardCharsets.UTF_8);
                String value = objects.get(source);
                if (!"*".equals(h.getFirst("If-None-Match"))
                        || !("\"" + value + "\"").equals(h.getFirst("x-amz-copy-source-if-match"))) status = 412;
                else if (objects.putIfAbsent(path, value) != null) status = 412;
                if (status == 200) body = "<CopyObjectResult><ETag>\"" + value + "\"</ETag></CopyObjectResult>";
                else body = "<Error><Code>PreconditionFailed</Code></Error>";
            } else if (exchange.getRequestMethod().equals("DELETE")) { objects.remove(path); status = 204; }
            else status = 405;
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, body.isEmpty() ? -1 : bytes.length);
            if (bytes.length > 0) exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try (var client = S3Client.builder().region(Region.US_EAST_1).forcePathStyle(true)
                .endpointOverride(URI.create("http://127.0.0.1:" + server.getAddress().getPort()))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("fixture", "fixture-secret")))
                .overrideConfiguration(c -> c.apiCallTimeout(java.time.Duration.ofSeconds(5))).build()) {
            var files = service(client);
            assertThat(files.completeUpload(1L, request)).isEqualTo(receipt);
            assertThat(objects.get(finalPath)).isEqualTo("good");
            objects.put(pending, "evil"); // 완료 뒤 원래 업로드 주소로 같은 크기의 다른 사진을 올린 상황
            assertThat(files.completeUpload(1L, request)).isEqualTo(receipt);
            assertThat(objects.get(finalPath)).isEqualTo("good");
            assertThat(copies.get()).isEqualTo(2);
            assertThat(signedConditions.get()).isEqualTo(2);
        } finally { server.stop(0); }
    }
    @Test void existingFinalObjectMustPassContentValidationBeforeCompletion() {
        when(s3.copyObject(any(CopyObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(412).build());
        doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"invalid fixture media"))
                .when(mediaValidator).validatePublished(eq(target),anyString());
        assertThatThrownBy(()->service(s3).completeUpload(1L,request)).isInstanceOfSatisfying(ResponseStatusException.class,
                error->assertThat(error.getStatusCode().value()).isEqualTo(400));
        verify(transactions,never()).markCompleted(anyLong(),anyLong(),any());
    }

    @Test void invalidStagingContentNeverGetsPublishedOrMarkedCompleted() {
        doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"invalid fixture media"))
                .when(mediaValidator).validate(eq(target),anyString());
        assertThatThrownBy(()->service(s3).completeUpload(1L,request)).isInstanceOfSatisfying(ResponseStatusException.class,
                error->assertThat(error.getStatusCode().value()).isEqualTo(400));
        verify(s3,never()).copyObject(any(CopyObjectRequest.class));
        verify(transactions,never()).markCompleted(anyLong(),anyLong(),any());
    }
}
