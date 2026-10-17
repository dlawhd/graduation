package shop.esjh.memoryjar.isolated;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import shop.esjh.memoryjar.config.AiGenerationAsyncConfig;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.config.properties.*;
import shop.esjh.memoryjar.service.ai.*;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.sesv2.SesV2Client;

import static org.mockito.Mockito.*;

/** 시험 소스에만 존재하는 외부 연동 경계. 실제 SDK 클라이언트 설정은 가져오지 않는다. */
@TestConfiguration(proxyBeanMethods = false)
@Import({JpaAuditConfig.class, AiGenerationAsyncConfig.class, JarDesignDraftService.class,
        JarDesignCutoutPathCodec.class, JarAiGenerationPersistenceService.class,
        JarAiGenerationService.class, JarAiGenerationRequestService.class,
        JarAiGenerationAsyncWorker.class, JarAiGenerationRealtimeService.class,
        AiPromptCatalog.class, AiDraftS3KeyFactory.class, GeneratedAiImageValidator.class,
        PixelPostProcessor.class, DraftOriginalImageModerationService.class})
class IsolatedProviderConfig {
    /** 기본 응답으로 null/성공을 반환하지 않아 새 외부 경로를 추가하면 시험이 실패한다. */
    static <T> T blocked(Class<T> type) {
        return mock(type, invocation -> {
            // Spring이 종료 시 대역 자원을 정리하는 close는 외부 통신이 아니다.
            if (invocation.getMethod().getName().equals("close")
                    && invocation.getMethod().getParameterCount() == 0) return null;
            if (invocation.getMethod().getDeclaringClass() == Object.class) {
                return org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
            }
            throw new AssertionError("Unconfigured isolated provider call: "
                    + type.getSimpleName() + "." + invocation.getMethod().getName());
        });
    }

    @Bean S3Client s3Client() { return blocked(S3Client.class); }
    @Bean S3Presigner s3Presigner() { return blocked(S3Presigner.class); }
    @Bean RekognitionClient rekognitionClient() { return blocked(RekognitionClient.class); }
    @Bean SesV2Client sesV2Client() { return blocked(SesV2Client.class); }
    @Bean CloudflareWorkersAiClient cloudflareWorkersAiClient() { return blocked(CloudflareWorkersAiClient.class); }
    @Bean SimpMessagingTemplate messagingTemplate() { return mock(SimpMessagingTemplate.class); }
    @Bean ObjectMapper objectMapper() { return new ObjectMapper(); }
    @Bean AiDraftProperties draftProperties() { return new AiDraftProperties(); }
    @Bean AiGenerationImageProperties imageProperties() { return new AiGenerationImageProperties(); }
    @Bean CloudflareAiProperties providerProperties() { return new CloudflareAiProperties(); }
    @Bean S3Properties storageProperties() {
        var properties = new S3Properties();
        properties.setBucket("isolated-test-only");
        return properties;
    }
    @Bean AiGenerationExecutionProperties executionProperties() {
        // 시험만 1 worker + 1 queue로 줄여 작은 요청 수로 실제 포화를 만든다. 운영 값은 유지한다.
        var properties = new AiGenerationExecutionProperties();
        properties.setPoolSize(1);
        properties.setQueueCapacity(1);
        return properties;
    }
}
