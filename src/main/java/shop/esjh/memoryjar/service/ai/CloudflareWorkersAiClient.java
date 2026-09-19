package shop.esjh.memoryjar.service.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiGenerationImageProperties;
import shop.esjh.memoryjar.config.properties.CloudflareAiProperties;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
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
    private static final int JSON_ENVELOPE_ALLOWANCE_BYTES = 64 * 1024;

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
                if (response.statusCode() == 429) {
                    throw new CloudflareAiClientException(
                            FailureType.RATE_LIMITED,
                            "Cloudflare AI 요청 한도를 초과했습니다."
                    );
                }

                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    throw new CloudflareAiClientException(
                            FailureType.REQUEST_FAILED,
                            "Cloudflare AI 요청에 실패했습니다."
                    );
                }

                return extractImageBytes(readBoundedResponseBody(responseBody));
            }
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
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Cloudflare AI 실행 설정이 준비되지 않았습니다."
            );
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
        String fileName = URLEncoder.encode(image.fileName(), StandardCharsets.UTF_8)
                .replace("+", "%20");
        byte[] header = ("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"" + fieldName
                + "\"; filename*=UTF-8''" + fileName + "\r\n"
                + "Content-Type: image/png\r\n\r\n").getBytes(StandardCharsets.UTF_8);
        byte[] trailer = "\r\n".getBytes(StandardCharsets.UTF_8);
        byte[] part = new byte[header.length + image.bytes().length + trailer.length];
        System.arraycopy(header, 0, part, 0, header.length);
        System.arraycopy(image.bytes(), 0, part, header.length, image.bytes().length);
        System.arraycopy(trailer, 0, part, header.length + image.bytes().length, trailer.length);
        return part;
    }

    private byte[] extractImageBytes(String responseBody) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            if (!root.path("success").asBoolean(false)) {
                throw new CloudflareAiClientException(
                        FailureType.REQUEST_FAILED,
                        "Cloudflare AI가 생성 요청을 거절했습니다."
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

        public CloudflareAiClientException(FailureType failureType, String message) {
            super(message);
            this.failureType = failureType;
        }

        public CloudflareAiClientException(FailureType failureType, String message, Throwable cause) {
            super(message, cause);
            this.failureType = failureType;
        }

        public FailureType getFailureType() {
            return failureType;
        }
    }

    public enum FailureType {
        RATE_LIMITED,
        TIMEOUT,
        INVALID_RESPONSE,
        REQUEST_FAILED
    }
}
