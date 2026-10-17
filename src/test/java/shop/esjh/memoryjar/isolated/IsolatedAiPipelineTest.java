package shop.esjh.memoryjar.isolated;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.*;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import shop.esjh.memoryjar.service.ai.*;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.rekognition.model.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 임시 MariaDB와 실제 비동기 실행기를 연결하되, 외부 비용 경계는 대역으로 고정한다. */
@DataJpaTest(showSql = false, properties = {
        "app.ai-generation-execution.pool-size=1",
        "app.ai-generation-execution.queue-capacity=1",
        "spring.docker.compose.enabled=false"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(IsolatedProviderConfig.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class IsolatedAiPipelineTest extends AbstractMariaDbRepositoryTest {
    @Autowired JarAiGenerationRequestService requests;
    @Autowired JarAiGenerationRepository generations;
    @Autowired PlatformTransactionManager transactions;
    @Autowired CloudflareWorkersAiClient cloudflare;
    @Autowired S3Client s3;
    @Autowired RekognitionClient moderation;
    @Autowired ThreadPoolTaskExecutor aiGenerationTaskExecutor;
    @Autowired DataSource dataSource;
    @Autowired ApplicationContext context;

    private record Fixture(Long owner, Long draft) { }

    @Test
    void databaseAndProviderBindingsAreIsolated() throws Exception {
        try (var connection = dataSource.getConnection()) {
            // 로컬 설정이 우연히 시험 DB를 대체해도 계속 진행하지 않도록 실제 연결을 대조한다.
            // 드라이버가 덧붙이는 인증 query는 비교·오류 출력에서 제외한다.
            String actualTarget = connection.getMetaData().getURL().split("\\?", 2)[0];
            String expectedTarget = mariaDBContainer.getJdbcUrl().split("\\?", 2)[0];
            assertThat(actualTarget.equals(expectedTarget)).as("JDBC target must be disposable MariaDB").isTrue();
        }
        assertThat(mockingDetails(s3).isMock()).isTrue();
        assertThat(mockingDetails(cloudflare).isMock()).isTrue();
        assertThat(mockingDetails(moderation).isMock()).isTrue();
        assertThat(mockingDetails(context.getBean(software.amazon.awssdk.services.sesv2.SesV2Client.class)).isMock()).isTrue();
        assertThat(context.getBeansOfType(shop.esjh.memoryjar.config.S3Config.class)).isEmpty();
        assertThat(context.getBeansOfType(shop.esjh.memoryjar.config.SesConfig.class)).isEmpty();
        assertThat(context.getBeansOfType(shop.esjh.memoryjar.config.AiDraftConfig.class)).isEmpty();
        assertThat(context.getBeansOfType(shop.esjh.memoryjar.config.CloudflareAiConfig.class)).isEmpty();
    }

    /** 별도 트랜잭션에서 커밋해야 비동기 worker가 시험 Draft를 조회할 수 있다. */
    private Fixture fixture() {
        return new TransactionTemplate(transactions).execute(status -> {
            String id = UUID.randomUUID().toString();
            var owner = saveUser(id, id + "@example.invalid", "격리 시험");
            var draft = persist(JarDesignDraft.builder().owner(owner).originalS3Key("original.png")
                    .expiresAt(LocalDateTime.now(ZoneId.of("Asia/Seoul")).plusDays(1)).build());
            return new Fixture(owner.getId(), draft.getDraftId());
        });
    }

    @Test
    void realQueueRejectsOverflowAndRecoversAfterBlockedProviderFinishes() throws Exception {
        assertThat(aiGenerationTaskExecutor.getCorePoolSize()).isEqualTo(1);
        byte[] image = png();
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        doAnswer(call -> new ResponseInputStream<>(GetObjectResponse.builder().build(),
                new ByteArrayInputStream(image))).when(s3).getObject(any(GetObjectRequest.class));
        doAnswer(call -> {
            entered.countDown();
            if (!release.await(15, TimeUnit.SECONDS)) throw new AssertionError("Provider latch timed out");
            return image;
        }).when(cloudflare).generateImage(any());
        doReturn(DetectModerationLabelsResponse.builder().build()).when(moderation)
                .detectModerationLabels(any(DetectModerationLabelsRequest.class));
        doReturn(PutObjectResponse.builder().build()).when(s3)
                .putObject(any(PutObjectRequest.class), any(RequestBody.class));

        var first = fixture(); var second = fixture(); var third = fixture();
        try {
            Long firstId = requests.request(first.owner, first.draft, JarAiStyle.CUTE_2D, null);
            assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
            // 같은 Draft 중복은 큐에 넣기 전에 DB 잠금 아래에서 거절해야 한다.
            assertThatThrownBy(() -> requests.request(first.owner, first.draft, JarAiStyle.CUTE_2D, null))
                    .isInstanceOfSatisfying(ApiException.class, error ->
                            assertThat(error.getErrorCode()).isEqualTo(AiDraftErrorCode.AI_GENERATION_ALREADY_PROCESSING));
            Long secondId = requests.request(second.owner, second.draft, JarAiStyle.CUTE_2D, null);
            assertThat(aiGenerationTaskExecutor.getThreadPoolExecutor().getQueue()).hasSize(1);
            assertThatThrownBy(() -> requests.request(third.owner, third.draft, JarAiStyle.CUTE_2D, null))
                    .isInstanceOfSatisfying(ApiException.class, error ->
                            assertThat(error.getErrorCode()).isEqualTo(AiDraftErrorCode.AI_GENERATION_QUEUE_FULL));
            var rejected = generations.findByDraft_DraftIdOrderByGenerationIdDesc(third.draft).get(0);
            assertThat(rejected.getStatus()).isEqualTo(JarAiGenerationStatus.FAILED);
            assertThat(rejected.getErrorCode()).isEqualTo(JarAiGenerationErrorCode.GENERATION_QUEUE_FULL);
            release.countDown();
            awaitSuccess(firstId); awaitSuccess(secondId);
            // 포화 해제 뒤 동일한 요청 경로를 다시 받아 처리할 수 있는지 확인한다.
            awaitSuccess(requests.request(third.owner, third.draft, JarAiStyle.CUTE_2D, null));
            verify(cloudflare, times(3)).generateImage(any());
            verify(s3, times(3)).putObject(any(PutObjectRequest.class), any(RequestBody.class));
        } finally {
            release.countDown();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while ((aiGenerationTaskExecutor.getActiveCount() != 0
                    || !aiGenerationTaskExecutor.getThreadPoolExecutor().getQueue().isEmpty())
                    && System.nanoTime() < deadline) Thread.sleep(25);
        }
    }

    @Test
    void unspecifiedProviderOperationFailsInsteadOfFallingBackToAws() {
        // 독립 대역으로 검사하여 다른 시나리오의 stub이나 실행 순서에 의존하지 않는다.
        S3Client blocked = IsolatedProviderConfig.blocked(S3Client.class);
        assertThatThrownBy(() -> blocked.listBuckets()).isInstanceOf(AssertionError.class)
                .hasMessageContaining("Unconfigured isolated provider call");
    }

    /** 시간 제한을 둔 상태 조회. 스레드 시작 순서나 임의의 긴 sleep에 기대지 않는다. */
    private void awaitSuccess(Long generationId) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (System.nanoTime() < deadline) {
            var state = generations.findById(generationId).orElseThrow().getStatus();
            if (state == JarAiGenerationStatus.SUCCEEDED) return;
            assertThat(state).isEqualTo(JarAiGenerationStatus.PROCESSING);
            Thread.sleep(25);
        }
        fail("AI generation did not finish within the isolated test deadline");
    }

    private byte[] png() throws Exception {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(1024, 1024, BufferedImage.TYPE_INT_RGB), "png", output);
        return output.toByteArray();
    }
}
