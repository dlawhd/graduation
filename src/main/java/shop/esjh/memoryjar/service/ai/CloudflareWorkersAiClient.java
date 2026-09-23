package shop.esjh.memoryjar.service.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.config.properties.AiGenerationImageProperties;
import shop.esjh.memoryjar.config.properties.CloudflareAiProperties;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Cloudflare Workers AI REST API 호출만 담당하는 Client다.
 *
 * 이 클래스는 Draft 상태 변경, S3 저장, 후보 성공 처리처럼 DB 트랜잭션이 필요한
 * 일을 하지 않는다. Generation Service가 트랜잭션 밖에서 이 Client를 호출하도록
 * 분리해 외부 네트워크 대기 동안 DB 커넥션을 점유하지 않게 한다.
 */
@Component
public class CloudflareWorkersAiClient {

    private static final String API_BASE_URL = "https://api.cloudflare.com/client/v4";
    private static final Pattern SAFE_ACCOUNT_ID = Pattern.compile("[A-Za-z0-9_-]+");
    private static final Pattern SAFE_MODEL = Pattern.compile("@cf/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+");
    private static final Pattern SAFE_ERROR_CODE = Pattern.compile("[A-Za-z0-9._-]{1,64}");
    private static final Pattern SAFE_CF_RAY = Pattern.compile("[A-Za-z0-9_-]{1,128}");
    private static final int JSON_ENVELOPE_ALLOWANCE_BYTES = 64 * 1024;
    private static final int MAX_ERROR_RESPONSE_BYTES = 64 * 1024;
    private static final int MAX_LOGGED_ERROR_CODES = 5;
    private static final Logger log = LoggerFactory.getLogger(CloudflareWorkersAiClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final CloudflareAiProperties properties;
    private final AiGenerationImageProperties generationImageProperties;

    public CloudflareWorkersAiClient(
            HttpClient cloudflareAiHttpClient,
            ObjectMapper objectMapper,
            CloudflareAiProperties properties,
            AiGenerationImageProperties generationImageProperties
    ) {
        this.httpClient = cloudflareAiHttpClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.generationImageProperties = generationImageProperties;
    }

    /**
     * prompt와 최대 네 장의 PNG 참조 이미지를 multipart/form-data로 전송하고,
     * Cloudflare 응답의 Base64 이미지 바이트를 반환한다.
     */
    public byte[] generateImage(CloudflareImageGenerationRequest request) {
        validateConfiguration();
        validateRequest(request);

        String boundary = "MemoryJarCloudflare-" + UUID.randomUUID();
        HttpRequest httpRequest = HttpRequest.newBuilder(buildRunUri())
                .timeout(Duration.ofSeconds(properties.getTimeoutSeconds()))
                .header("Authorization", "Bearer " + properties.getApiToken())
                .header("Accept", "application/json")
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(
                        buildMultipartBody(boundary, request)
                ))
                .build();

        try {
            HttpResponse<InputStream> response = httpClient.send(
                    httpRequest,
                    HttpResponse.BodyHandlers.ofInputStream()
            );

            try (InputStream responseBody = response.body()) {
                int statusCode = response.statusCode();
                String cfRay = extractCfRay(response.headers());
                if (response.statusCode() == 429) {
                    throw providerHttpFailure(FailureType.RATE_LIMITED, statusCode, cfRay, responseBody);
                }

                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    throw providerHttpFailure(FailureType.REQUEST_FAILED, statusCode, cfRay, responseBody);
                }

                return extractImageBytes(readBoundedResponseBody(responseBody), statusCode, cfRay);
            }
        } catch (CloudflareAiClientException exception) {
            // Token·Account ID·prompt·Cloudflare 오류 메시지는 로그에 남기지 않는다.
            // 운영자는 status와 오류 코드만으로 권한·요청 규격·할당량 문제를 안전하게 구분할 수 있다.
            log.warn("Cloudflare AI 요청이 실패했습니다. status={} cloudflareErrorCodes={} cfRay={}",
                    exception.getHttpStatus() == null ? "unknown" : exception.getHttpStatus(),
                    exception.getCloudflareErrorCodes().isEmpty() ? "none" : exception.getCloudflareErrorCodes(),
                    exception.getCfRay() == null ? "none" : exception.getCfRay());
            throw exception;
        } catch (java.net.http.HttpTimeoutException exception) {
            throw new CloudflareAiClientException(
                    FailureType.TIMEOUT,
                    "Cloudflare AI 응답 시간이 초과되었습니다.",
                    exception
            );
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new CloudflareAiClientException(
                    FailureType.REQUEST_FAILED,
                    "Cloudflare AI 요청이 중단되었습니다.",
                    exception
            );
        } catch (IOException exception) {
            throw new CloudflareAiClientException(
                    FailureType.REQUEST_FAILED,
                    "Cloudflare AI와 통신하지 못했습니다.",
                    exception
            );
        }
    }

    private URI buildRunUri() {
        return URI.create(
                API_BASE_URL + "/accounts/" + properties.getAccountId()
                        + "/ai/run/" + properties.getModel()
        );
    }

    private void validateConfiguration() {
        if (!StringUtils.hasText(properties.getAccountId())
                || !SAFE_ACCOUNT_ID.matcher(properties.getAccountId()).matches()
                || !StringUtils.hasText(properties.getApiToken())
                || !StringUtils.hasText(properties.getModel())
                || !SAFE_MODEL.matcher(properties.getModel()).matches()
                || properties.getTimeoutSeconds() < 1
                || !isSupportedOutputDimension(generationImageProperties.getRequiredGeneratedImageWidth())
                || !isSupportedOutputDimension(generationImageProperties.getRequiredGeneratedImageHeight())
                || generationImageProperties.getMaxGeneratedImageSize() < 1) {
            throw new ApiException(AiDraftErrorCode.AI_PROVIDER_CONFIGURATION_UNAVAILABLE);
        }
    }

    private boolean isSupportedOutputDimension(int dimension) {
        return dimension >= 256 && dimension <= 1920;
    }

    private void validateRequest(CloudflareImageGenerationRequest request) {
        if (request == null || !StringUtils.hasText(request.prompt())) {
            throw new IllegalArgumentException("Cloudflare AI prompt가 필요합니다.");
        }

        List<CloudflareImageInput> images = request.images();
        if (images == null || images.isEmpty() || images.size() > 4) {
            throw new IllegalArgumentException("Cloudflare AI에는 1개 이상 4개 이하의 입력 이미지가 필요합니다.");
        }

        for (int index = 0; index < images.size(); index++) {
            CloudflareImageInput image = images.get(index);
            if (image == null || image.bytes() == null || image.bytes().length == 0) {
                throw new IllegalArgumentException("Cloudflare AI 입력 이미지가 비어 있습니다.");
            }
        }
    }

    private byte[] buildMultipartBody(
            String boundary,
            CloudflareImageGenerationRequest request
    ) {
        List<byte[]> parts = new ArrayList<>();
        parts.add(textPart(boundary, "prompt", request.prompt()));
        // 모델 기본 출력은 직사각형이므로 서버가 일반 후보 계약인 1024×1024를 항상 명시한다.
        parts.add(textPart(boundary, "width", String.valueOf(generationImageProperties.getRequiredGeneratedImageWidth())));
        parts.add(textPart(boundary, "height", String.valueOf(generationImageProperties.getRequiredGeneratedImageHeight())));

        if (request.seed() != null) {
            parts.add(textPart(boundary, "seed", String.valueOf(request.seed())));
        }

        for (int index = 0; index < request.images().size(); index++) {
            CloudflareImageInput image = request.images().get(index);
            parts.add(filePart(boundary, "input_image_" + index, image));
        }

        parts.add(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

        int totalLength = parts.stream().mapToInt(part -> part.length).sum();
        byte[] body = new byte[totalLength];
        int offset = 0;
        for (byte[] part : parts) {
            System.arraycopy(part, 0, body, offset, part.length);
            offset += part.length;
        }
        return body;
    }

    private byte[] textPart(String boundary, String fieldName, String value) {
        String part = "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"" + fieldName + "\"\r\n\r\n"
                + value + "\r\n";
        return part.getBytes(StandardCharsets.UTF_8);
    }

    private byte[] filePart(String boundary, String fieldName, CloudflareImageInput image) {
        // 현재 파일명은 서버가 고정한 ASCII 값이다. curl과 같은 filename= 형식을 써야
        // Workers AI가 multipart 파일 파트를 일관되게 해석한다.
        String fileName = image.fileName();
        byte[] header = ("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"" + fieldName
                + "\"; filename=\"" + fileName + "\"\r\n"
                + "Content-Type: image/png\r\n\r\n").getBytes(StandardCharsets.UTF_8);
        byte[] trailer = "\r\n".getBytes(StandardCharsets.UTF_8);
        byte[] part = new byte[header.length + image.bytes().length + trailer.length];
        System.arraycopy(header, 0, part, 0, header.length);
        System.arraycopy(image.bytes(), 0, part, header.length, image.bytes().length);
        System.arraycopy(trailer, 0, part, header.length + image.bytes().length, trailer.length);
        return part;
    }

    private CloudflareAiClientException providerHttpFailure(FailureType failureType, int statusCode, String cfRay,
                                                            InputStream responseBody) throws IOException {
        return new CloudflareAiClientException(
                failureType,
                failureType == FailureType.RATE_LIMITED
                        ? "Cloudflare AI 요청 한도를 초과했습니다."
                        : "Cloudflare AI 요청에 실패했습니다.",
                statusCode,
                cfRay,
                extractCloudflareErrorCodes(readBoundedErrorResponseBody(responseBody))
        );
    }

    /** 성공 HTTP 응답 안의 Cloudflare 오류 봉투도 일반 요청 실패로 분류한다. */
    private byte[] extractImageBytes(String responseBody, int statusCode, String cfRay) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            if (!root.path("success").asBoolean(false)) {
                throw new CloudflareAiClientException(
                        FailureType.REQUEST_FAILED,
                        "Cloudflare AI가 생성 요청을 거절했습니다.",
                        statusCode,
                        cfRay,
                        extractCloudflareErrorCodes(root)
                );
            }

            String encodedImage = root.path("result").path("image").asText(null);
            if (!StringUtils.hasText(encodedImage)) {
                throw new CloudflareAiClientException(
                        FailureType.INVALID_RESPONSE,
                        "Cloudflare AI 응답에 이미지가 없습니다."
                );
            }

            int base64Marker = encodedImage.indexOf("base64,");
            String base64 = base64Marker >= 0
                    ? encodedImage.substring(base64Marker + "base64,".length())
                    : encodedImage;
            if (base64.length() > maximumBase64Characters()) {
                throw new CloudflareAiClientException(
                        FailureType.INVALID_RESPONSE,
                        "Cloudflare AI 응답 이미지가 허용 크기를 초과했습니다."
                );
            }

            return Base64.getDecoder().decode(base64);
        } catch (CloudflareAiClientException exception) {
            throw exception;
        } catch (IOException | IllegalArgumentException exception) {
            throw new CloudflareAiClientException(
                    FailureType.INVALID_RESPONSE,
                    "Cloudflare AI 이미지 응답 형식이 올바르지 않습니다.",
                    exception
            );
        }
    }

    private long maximumBase64Characters() {
        return ((generationImageProperties.getMaxGeneratedImageSize() + 2L) / 3L) * 4L;
    }

    private String readBoundedResponseBody(InputStream responseBody) throws IOException {
        long maxBodyBytes = maximumBase64Characters() + JSON_ENVELOPE_ALLOWANCE_BYTES;
        if (maxBodyBytes >= Integer.MAX_VALUE) {
            throw new CloudflareAiClientException(
                    FailureType.INVALID_RESPONSE,
                    "Cloudflare AI 응답 크기 제한 설정이 올바르지 않습니다."
            );
        }
        byte[] body = responseBody.readNBytes((int) maxBodyBytes + 1);
        if (body.length > maxBodyBytes) {
            throw new CloudflareAiClientException(
                    FailureType.INVALID_RESPONSE,
                    "Cloudflare AI 응답 본문이 허용 크기를 초과했습니다."
            );
        }
        return new String(body, StandardCharsets.UTF_8);
    }

    /** 오류 본문은 이미지 본문보다 훨씬 작은 별도 제한으로 읽어, 진단 때문에 메모리를 낭비하지 않는다. */
    private String readBoundedErrorResponseBody(InputStream responseBody) throws IOException {
        byte[] body = responseBody.readNBytes(MAX_ERROR_RESPONSE_BYTES + 1);
        if (body.length > MAX_ERROR_RESPONSE_BYTES) {
            return "";
        }
        return new String(body, StandardCharsets.UTF_8);
    }

    /** Cloudflare의 errors[].code만 제한적으로 추출한다. 오류 메시지·본문은 절대 로그에 남기지 않는다. */
    private List<String> extractCloudflareErrorCodes(String responseBody) {
        try {
            return extractCloudflareErrorCodes(objectMapper.readTree(responseBody));
        } catch (IOException exception) {
            return List.of();
        }
    }

    private List<String> extractCloudflareErrorCodes(JsonNode root) {
        List<String> errorCodes = new ArrayList<>();
        for (JsonNode error : root.path("errors")) {
            String code = error.path("code").asText("");
            if (SAFE_ERROR_CODE.matcher(code).matches() && !errorCodes.contains(code)) {
                errorCodes.add(code);
                if (errorCodes.size() == MAX_LOGGED_ERROR_CODES) {
                    break;
                }
            }
        }
        return List.copyOf(errorCodes);
    }

    /** Cloudflare 지원·장애 추적에 쓰는 응답 식별자만 허용 형식으로 보관한다. */
    private String extractCfRay(HttpHeaders headers) {
        if (headers == null) {
            return null;
        }
        return headers.firstValue("cf-ray")
                .filter(value -> SAFE_CF_RAY.matcher(value).matches())
                .orElse(null);
    }

    /** Cloudflare AI 입력 이미지는 실제 PNG 바이트와 로그에 남기지 않을 파일명만 보관한다. */
    public record CloudflareImageInput(String fileName, byte[] bytes) {
        public CloudflareImageInput {
            if (!StringUtils.hasText(fileName)) {
                throw new IllegalArgumentException("Cloudflare AI 입력 파일명이 필요합니다.");
            }
        }
    }

    /** Cloudflare 호출에 필요한 값만 담는 내부 요청 계약이다. */
    public record CloudflareImageGenerationRequest(
            String prompt,
            List<CloudflareImageInput> images,
            Long seed
    ) {
    }

    /** Generation Service가 DB 오류 코드로 변환할 수 있는 외부 호출 실패다. */
    public static class CloudflareAiClientException extends RuntimeException {
        private final FailureType failureType;
        private final Integer httpStatus;
        private final String cfRay;
        private final List<String> cloudflareErrorCodes;

        public CloudflareAiClientException(FailureType failureType, String message) {
            super(message);
            this.failureType = failureType;
            this.httpStatus = null;
            this.cfRay = null;
            this.cloudflareErrorCodes = List.of();
        }

        public CloudflareAiClientException(FailureType failureType, String message, Throwable cause) {
            super(message, cause);
            this.failureType = failureType;
            this.httpStatus = null;
            this.cfRay = null;
            this.cloudflareErrorCodes = List.of();
        }

        private CloudflareAiClientException(FailureType failureType, String message,
                                            int httpStatus, String cfRay,
                                            List<String> cloudflareErrorCodes) {
            super(message);
            this.failureType = failureType;
            this.httpStatus = httpStatus;
            this.cfRay = cfRay;
            this.cloudflareErrorCodes = List.copyOf(cloudflareErrorCodes);
        }

        public FailureType getFailureType() {
            return failureType;
        }

        public Integer getHttpStatus() {
            return httpStatus;
        }

        public String getCfRay() {
            return cfRay;
        }

        public List<String> getCloudflareErrorCodes() {
            return cloudflareErrorCodes;
        }
    }

    public enum FailureType {
        RATE_LIMITED,
        TIMEOUT,
        INVALID_RESPONSE,
        REQUEST_FAILED
    }
}
