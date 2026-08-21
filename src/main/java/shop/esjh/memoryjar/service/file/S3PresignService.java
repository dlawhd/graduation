package shop.esjh.memoryjar.service.file;

import shop.esjh.memoryjar.config.properties.FileProperties;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.file.request.FilePresignRequest;
import shop.esjh.memoryjar.dto.file.response.FilePresignResponse;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

// 이 서비스는 "S3 업로드용 presigned URL"을 만드는 역할을 함
// 1. 파일이 NOTE용인지, PROFILE용인지 확인하고
// 2. S3 안에 저장될 경로(s3Key)를 만들고
// 3. 프론트가 직접 업로드할 수 있는 임시 URL(uploadUrl)을 발급해 주는 서비스
@Service
public class S3PresignService {

    private final S3Presigner s3Presigner;
    private final S3Properties s3Properties;
    private final FileProperties fileProperties;

    public S3PresignService(
            S3Presigner s3Presigner,
            S3Properties s3Properties,
            FileProperties fileProperties
    ) {
        this.s3Presigner = s3Presigner;
        this.s3Properties = s3Properties;
        this.fileProperties = fileProperties;
    }

    // presigned URL 생성
    public FilePresignResponse createPresignedUrl(FilePresignRequest request) {

        // 1. 파일 타입 검증
        validateContentType(request.contentType());

        // 2. 파일 종류에 맞는 최대 크기를 검사한다.
        // 사진은 10MB, 영상은 30MB 기준으로 검사한다.
        validateFileSize(
                request.size(),
                request.contentType()
        );

        // 3. S3 안에서 저장될 경로(s3Key) 만들기
        String s3Key = createS3Key(request.purpose(), request.fileName());

        // 4. 업로드 요청 정보 만들기
        PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                .bucket(s3Properties.getBucket())
                .key(s3Key)
                .contentType(request.contentType())
                .build();

        // 5. presigned URL 유효 시간
        Duration signatureDuration = Duration.ofSeconds(s3Properties.getPresignExpSeconds());

        // 6. presigned URL 요청 만들기
        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(signatureDuration)
                .putObjectRequest(putObjectRequest)
                .build();

        // 7. 진짜 presigned URL 생성
        PresignedPutObjectRequest presignedRequest = s3Presigner.presignPutObject(presignRequest);

        // 8. 만료 시간 계산
        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC)
                .plusSeconds(s3Properties.getPresignExpSeconds());

        // 9. public URL 만들기
        String publicUrl = createPublicUrl(s3Key);

        // 10. 응답 반환
        return new FilePresignResponse(
                presignedRequest.url().toString(),
                s3Key,
                publicUrl,
                expiresAt
        );
    }

    // contentType 검증
    private void validateContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "contentType은 비어 있을 수 없어요."
            );
        }

        Set<String> allowedTypes = new HashSet<>();
        if (fileProperties.getAllowedImageTypes() != null) {
            allowedTypes.addAll(fileProperties.getAllowedImageTypes());
        }
        if (fileProperties.getAllowedVideoTypes() != null) {
            allowedTypes.addAll(fileProperties.getAllowedVideoTypes());
        }

        if (!allowedTypes.contains(contentType)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "허용하지 않는 파일 형식이에요."
            );
        }
    }

    /*
     * 파일 크기 검증
     *
     * 사진과 영상의 최대 용량을 서로 다르게 검사한다.
     *
     * 현재 정책:
     * - 사진: 최대 10MB
     * - 영상: 최대 30MB
     *
     * contentType이 allowedVideoTypes에 들어 있으면 영상으로 판단하고,
     * 그렇지 않으면 기존 이미지 최대 크기를 사용한다.
     *
     * 참고:
     * 이 메서드가 실행되기 전에 validateContentType()을 먼저 실행하기 때문에
     * 허용하지 않는 이상한 파일 형식은 이미 앞에서 걸러진 상태다.
     */
    private void validateFileSize(
            Long size,
            String contentType
    ) {

        // 파일 크기는 반드시 0보다 커야 한다.
        if (size == null || size <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "파일 크기는 0보다 커야 해요."
            );
        }

        /*
         * 현재 파일이 영상인지 확인한다.
         *
         * 예:
         * video/mp4       → true
         * video/webm      → true
         * image/jpeg      → false
         */
        boolean isVideo =
                fileProperties.getAllowedVideoTypes() != null
                        && fileProperties
                        .getAllowedVideoTypes()
                        .contains(contentType);

        /*
         * 영상이면 30MB 제한을 사용하고,
         * 사진이면 기존 10MB 제한을 사용한다.
         */
        long maxSize = isVideo
                ? fileProperties.getMaxVideoSize()
                : fileProperties.getMaxSize();

        // 파일 종류에 해당하는 최대 크기를 넘었는지 확인한다.
        if (size > maxSize) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "파일이 너무 커요. 업로드 가능한 최대 크기를 확인해주세요."
            );
        }
    }


    // S3 저장 경로(s3Key) 생성
    // purpose별로 폴더를 나누고, 날짜 폴더를 넣어서 관리하기 쉽게 하고, UUID를 붙여서 파일 이름 충돌을 막는 것
    private String createS3Key(FilePurpose purpose, String fileName) {
        String folder = resolveFolder(purpose);
        String extension = extractExtension(fileName);

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        String year = String.valueOf(now.getYear());
        String month = String.format("%02d", now.getMonthValue());
        String day = String.format("%02d", now.getDayOfMonth());

        String uuid = UUID.randomUUID().toString();

        // 예: notes/2026/04/05/uuid.png
        return folder + "/" + year + "/" + month + "/" + day + "/" + uuid + extension;
    }

    // purpose에 따라 폴더 이름 결정
    private String resolveFolder(FilePurpose purpose) {
        return switch (purpose) {
            case NOTE -> "notes";
            case PROFILE -> "profiles";
            case JAR -> "jars";
        };
    }

    // 원본 파일 이름에서 확장자 추출
    private String extractExtension(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "파일 이름은 비어 있을 수 없어요."
            );
        }

        int lastDotIndex = fileName.lastIndexOf('.');

        // 점이 없거나, 맨 뒤가 점이면 확장자가 없는 파일로 판단
        if (lastDotIndex < 0 || lastDotIndex == fileName.length() - 1) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "파일 확장자를 확인할 수 없어요."
            );
        }

        String extension = fileName.substring(lastDotIndex).toLowerCase();

        // 너무 긴 이상한 확장자 방지
        if (extension.length() > 10) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "올바르지 않은 파일 확장자예요."
            );
        }

        return extension;
    }

    // public URL 생성
    // 예: publicBaseUrl = https://cdn.esjh.shop, s3Key = notes/2026/04/05/uuid.png
    // 결과: https://cdn.esjh.shop/notes/2026/04/05/uuid.png
    private String createPublicUrl(String s3Key) {
        String baseUrl = s3Properties.getPublicBaseUrl();

        if (baseUrl == null || baseUrl.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "publicBaseUrl 설정이 필요해요."
            );
        }

        // 혹시 한글/공백이 있더라도 안전하게 인코딩
        String encodedKey = encodePath(s3Key);

        if (baseUrl.endsWith("/")) {
            return baseUrl + encodedKey;
        }

        return baseUrl + "/" + encodedKey;
    }

    // URL path 안전 인코딩
    // URLEncoder는 / 도 인코딩하기 때문에 다시 / 는 복구해 줘야 경로가 깨지지 않아.
    private String encodePath(String path) {
        return URLEncoder.encode(path, StandardCharsets.UTF_8)
                .replace("%2F", "/");
    }
}