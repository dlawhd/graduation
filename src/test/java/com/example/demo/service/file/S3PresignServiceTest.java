package com.example.demo.service.file;

import com.example.demo.config.properties.FileProperties;
import com.example.demo.config.properties.S3Properties;
import com.example.demo.dto.file.request.FilePresignRequest;
import com.example.demo.dto.file.response.FilePresignResponse;
import com.example.demo.enums.file.FilePurpose;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.net.URL;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/*
 이 테스트 클래스는 S3PresignService가
 1) 파일 형식/크기/이름을 잘 검사하는지
 2) presigned URL을 잘 만드는지
 3) public URL을 안전하게 만드는지
 확인하는 역할을 해.
 */
@ExtendWith(MockitoExtension.class)
class S3PresignServiceTest {

    @Mock
    private S3Presigner s3Presigner;

    @Mock
    private S3Properties s3Properties;

    @Mock
    private FileProperties fileProperties;

    @Mock
    private PresignedPutObjectRequest presignedPutObjectRequest;

    @InjectMocks
    private S3PresignService s3PresignService;

    @Captor
    private ArgumentCaptor<PutObjectPresignRequest> presignRequestCaptor;

    @Test
    @DisplayName("presigned URL 생성 성공 - NOTE 파일이면 notes 폴더 아래 경로와 public URL을 만든다")
    void createPresignedUrl_success_note() throws Exception {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);
        stubS3BasicConfig();
        stubPresignerSuccess();

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                1024L
        );

        // when
        FilePresignResponse response = s3PresignService.createPresignedUrl(request);

        // then
        assertThat(response).isNotNull();
        assertThat(response.uploadUrl()).isEqualTo("https://s3-presigned-url.test/upload");
        assertThat(response.s3Key()).startsWith("notes/");
        assertThat(response.s3Key()).endsWith(".png");
        assertThat(response.publicUrl()).startsWith("https://cdn.test.com/notes/");
        assertThat(response.publicUrl()).endsWith(".png");
        assertThat(response.expiresAt()).isNotNull();

        verify(s3Presigner, times(1)).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("presigned URL 생성 성공 - PROFILE 파일이면 profiles 폴더를 사용한다")
    void createPresignedUrl_success_profileFolder() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);
        stubS3BasicConfig();
        stubPresignerSuccess();

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.PROFILE,
                "me.jpg",
                "image/jpeg",
                2048L
        );

        // when
        FilePresignResponse response = s3PresignService.createPresignedUrl(request);

        // then
        assertThat(response.s3Key()).startsWith("profiles/");
        assertThat(response.s3Key()).endsWith(".jpg");
        assertThat(response.publicUrl()).startsWith("https://cdn.test.com/profiles/");
    }

    @Test
    @DisplayName("presigned URL 생성 성공 - JAR 파일이면 jars 폴더를 사용한다")
    void createPresignedUrl_success_jarFolder() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);
        stubS3BasicConfig();
        stubPresignerSuccess();

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.JAR,
                "jar-image.webp",
                "image/webp",
                5000L
        );

        // when
        FilePresignResponse response = s3PresignService.createPresignedUrl(request);

        // then
        assertThat(response.s3Key()).startsWith("jars/");
        assertThat(response.s3Key()).endsWith(".webp");
        assertThat(response.publicUrl()).startsWith("https://cdn.test.com/jars/");
    }

    @Test
    @DisplayName("presigned URL 생성 성공 - publicBaseUrl 끝에 슬래시가 있어도 URL이 정상 생성된다")
    void createPresignedUrl_success_publicBaseUrlWithSlash() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);
        stubS3BasicConfig();
        stubPresignerSuccess();
        when(s3Properties.getPublicBaseUrl()).thenReturn("https://cdn.test.com/");

        when(s3Properties.getPublicBaseUrl()).thenReturn("https://cdn.test.com/");

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                1024L
        );

        // when
        FilePresignResponse response = s3PresignService.createPresignedUrl(request);

        // then
        assertThat(response.publicUrl()).startsWith("https://cdn.test.com/notes/");
        assertThat(response.publicUrl()).doesNotContain("//notes/");
    }

    @Test
    @DisplayName("presigned URL 생성 성공 - 한글 파일명이어도 확장자를 기준으로 정상 처리한다")
    void createPresignedUrl_success_koreanFileName() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);
        stubS3BasicConfig();
        stubPresignerSuccess();
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "우리사진.png",
                "image/png",
                1024L
        );

        // when
        FilePresignResponse response = s3PresignService.createPresignedUrl(request);

        // then
        assertThat(response.s3Key()).startsWith("notes/");
        assertThat(response.s3Key()).endsWith(".png");
        assertThat(response.publicUrl()).startsWith("https://cdn.test.com/notes/");
    }

    @Test
    @DisplayName("실제 presign 요청에 bucket, contentType, key가 잘 들어간다")
    void createPresignedUrl_buildsCorrectPutObjectRequest() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);
        stubS3BasicConfig();
        stubPresignerSuccess();
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                1024L
        );

        // when
        s3PresignService.createPresignedUrl(request);

        // then
        verify(s3Presigner).presignPutObject(presignRequestCaptor.capture());

        PutObjectPresignRequest captured = presignRequestCaptor.getValue();
        PutObjectRequest putObjectRequest = captured.putObjectRequest();

        assertThat(putObjectRequest.bucket()).isEqualTo("test-bucket");
        assertThat(putObjectRequest.contentType()).isEqualTo("image/png");
        assertThat(putObjectRequest.key()).startsWith("notes/");
        assertThat(putObjectRequest.key()).endsWith(".png");

        // signatureDuration도 설정값 300초를 사용해야 함
        assertThat(captured.signatureDuration().getSeconds()).isEqualTo(300);
    }

    @Test
    @DisplayName("contentType 검증 실패 - null이면 400")
    void createPresignedUrl_fail_contentTypeNull() {
        // given
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                null,
                1024L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("contentType은 비어 있을 수 없어.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("contentType 검증 실패 - 빈 문자열이면 400")
    void createPresignedUrl_fail_contentTypeBlank() {
        // given
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "   ",
                1024L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("contentType은 비어 있을 수 없어.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("contentType 검증 실패 - 허용하지 않는 형식이면 400")
    void createPresignedUrl_fail_unsupportedContentType() {
        // given
        stubAllowedTypes();

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "file.exe",
                "application/x-msdownload",
                1024L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("허용하지 않는 파일 형식이야.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("파일 크기 검증 실패 - 0 이하면 400")
    void createPresignedUrl_fail_sizeZeroOrLess() {
        // given
        stubAllowedTypes();

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                0L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("파일 크기는 0보다 커야 해.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("파일 크기 검증 실패 - 최대 크기를 넘으면 400")
    void createPresignedUrl_fail_sizeTooLarge() {
        // given
        stubAllowedTypes();
        stubMaxSize(100L);

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                101L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("파일이 너무 커. 업로드 가능한 최대 크기를 확인해줘.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("파일 이름 검증 실패 - null이면 400")
    void createPresignedUrl_fail_fileNameNull() {
        // given
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                null,
                "image/png",
                1024L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("허용하지 않는 파일 형식이야.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("확장자 검증 실패 - 점이 없으면 400")
    void createPresignedUrl_fail_noExtension() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo",
                "image/png",
                1024L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("파일 확장자를 확인할 수 없어.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("파일 이름 검증 실패 - 빈 문자열이면 400")
    void createPresignedUrl_fail_fileNameBlank() {
        // given
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "   ",
                "image/png",
                1024L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("허용하지 않는 파일 형식이야.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("확장자 검증 실패 - 마지막이 점이면 400")
    void createPresignedUrl_fail_dotAtEnd() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.",
                "image/png",
                1024L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("파일 확장자를 확인할 수 없어.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("확장자 검증 실패 - 너무 긴 확장자면 400")
    void createPresignedUrl_fail_extensionTooLong() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);
        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.abcdefghijkl",
                "image/png",
                1024L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("올바르지 않은 파일 확장자야.");
        verify(s3Presigner, never()).presignPutObject(any(PutObjectPresignRequest.class));
    }

    @Test
    @DisplayName("publicBaseUrl 검증 실패 - 설정이 없으면 500")
    void createPresignedUrl_fail_publicBaseUrlMissing() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);

        when(s3Properties.getBucket()).thenReturn("test-bucket");
        when(s3Properties.getPresignExpSeconds()).thenReturn(300);
        when(s3Properties.getPublicBaseUrl()).thenReturn("  ");
        when(s3Presigner.presignPutObject(any(PutObjectPresignRequest.class)))
                .thenReturn(presignedPutObjectRequest);

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                1024L
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> s3PresignService.createPresignedUrl(request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(ex.getReason()).isEqualTo("publicBaseUrl 설정이 필요해.");
    }

    @Test
    @DisplayName("s3Key 안에는 오늘 UTC 날짜 폴더가 들어간다")
    void createPresignedUrl_containsTodayUtcDateFolders() {
        // given
        stubAllowedTypes();
        stubMaxSize(10L * 1024 * 1024);
        stubS3BasicConfig();
        stubPresignerSuccess();

        LocalDate todayUtc = LocalDate.now(ZoneOffset.UTC);

        FilePresignRequest request = new FilePresignRequest(
                FilePurpose.NOTE,
                "photo.png",
                "image/png",
                1024L
        );

        // when
        FilePresignResponse response = s3PresignService.createPresignedUrl(request);

        // then
        String expectedDatePath = String.format(
                "notes/%d/%02d/%02d/",
                todayUtc.getYear(),
                todayUtc.getMonthValue(),
                todayUtc.getDayOfMonth()
        );

        assertThat(response.s3Key()).startsWith(expectedDatePath);
    }

    private void stubAllowedTypes() {
        when(fileProperties.getAllowedImageTypes())
                .thenReturn(List.of("image/png", "image/jpeg", "image/webp"));
        when(fileProperties.getAllowedVideoTypes())
                .thenReturn(List.of("video/mp4", "video/webm"));
    }

    private void stubMaxSize(long maxSize) {
        when(fileProperties.getMaxSize()).thenReturn(maxSize);
    }

    private void stubS3BasicConfig() {
        when(s3Properties.getBucket()).thenReturn("test-bucket");
        when(s3Properties.getPresignExpSeconds()).thenReturn(300);
        when(s3Properties.getPublicBaseUrl()).thenReturn("https://cdn.test.com");
    }

    private void stubPresignerSuccess() {
        try {
            when(presignedPutObjectRequest.url())
                    .thenReturn(new URL("https://s3-presigned-url.test/upload"));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        when(s3Presigner.presignPutObject(any(PutObjectPresignRequest.class)))
                .thenReturn(presignedPutObjectRequest);
    }
}