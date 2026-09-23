package shop.esjh.memoryjar.service.jar;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.jar.response.JarDesignResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.ai.JarDesign;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.ai.JarDesignType;
import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarTheme;
import shop.esjh.memoryjar.repository.ai.JarDesignRepository;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.math.BigDecimal;
import java.net.URL;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 최종 Jar 화면이 Private S3 Key를 노출하지 않고 디자인을 조회하는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class JarDesignViewServiceTest {

    @Mock private JarDesignRepository jarDesignRepository;
    @Mock private S3Presigner s3Presigner;
    @Mock private PresignedGetObjectRequest presignedGetObjectRequest;

    private S3Properties s3Properties;
    private JarDesignViewService service;

    @BeforeEach
    void setUp() {
        s3Properties = new S3Properties();
        s3Properties.setBucket("private-test-bucket");
        s3Properties.setPresignExpSeconds(300);
        service = new JarDesignViewService(jarDesignRepository, s3Presigner, s3Properties);
    }

    @Test
    @DisplayName("JarDesign이 있으면 짧은 이미지 URL과 저장된 Slot을 반환한다")
    void findByJarId_returnsPresignedImageAndSlot() throws Exception {
        JarDesign design = design(10L, "jar-designs/1/final.png");
        when(jarDesignRepository.findByJar_JarId(10L)).thenReturn(Optional.of(design));
        when(presignedGetObjectRequest.url()).thenReturn(new URL("https://signed.example.test/final"));
        when(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class)))
                .thenReturn(presignedGetObjectRequest);

        JarDesignResponse response = service.findByJarId(10L);

        assertThat(response.designType()).isEqualTo(JarDesignType.AI);
        assertThat(response.imageUrl()).isEqualTo("https://signed.example.test/final");
        assertThat(response.imageExpiresAt()).isNotNull();
        assertThat(response.slotCenterX()).isEqualByComparingTo("0.50000");
        assertThat(response.slotCenterY()).isEqualByComparingTo("0.30000");
        assertThat(response.slotSizeRatio()).isEqualByComparingTo("0.60000");

        ArgumentCaptor<GetObjectPresignRequest> requestCaptor =
                ArgumentCaptor.forClass(GetObjectPresignRequest.class);
        verify(s3Presigner).presignGetObject(requestCaptor.capture());
        assertThat(requestCaptor.getValue().getObjectRequest().bucket()).isEqualTo("private-test-bucket");
        assertThat(requestCaptor.getValue().getObjectRequest().key())
                .isEqualTo("jar-designs/1/final.png");
    }

    @Test
    @DisplayName("JarDesign 목록은 한 번에 조회하고 Jar ID별 응답을 만든다")
    void findByJarIds_usesBatchQuery() throws Exception {
        JarDesign first = design(10L, "jar-designs/1/first.png");
        JarDesign second = design(20L, "jar-designs/1/second.png");
        when(jarDesignRepository.findByJar_JarIdIn(List.of(10L, 20L)))
                .thenReturn(List.of(first, second));
        when(presignedGetObjectRequest.url()).thenReturn(new URL("https://signed.example.test/final"));
        when(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class)))
                .thenReturn(presignedGetObjectRequest);

        Map<Long, JarDesignResponse> responses = service.findByJarIds(List.of(10L, 20L));

        assertThat(responses).containsOnlyKeys(10L, 20L);
        verify(jarDesignRepository).findByJar_JarIdIn(List.of(10L, 20L));
    }

    @Test
    @DisplayName("JarDesign이 없으면 기존 Theme Jar를 위해 null을 반환한다")
    void findByJarId_returnsNullForDefaultJar() {
        when(jarDesignRepository.findByJar_JarId(10L)).thenReturn(Optional.empty());

        assertThat(service.findByJarId(10L)).isNull();
        verify(s3Presigner, never()).presignGetObject(any(GetObjectPresignRequest.class));
    }

    @Test
    @DisplayName("URL 발급 실패는 Jar 조회를 막지 않고 디자인 메타데이터를 유지한다")
    void findByJarId_keepsDesignWhenPresignFails() {
        JarDesign design = design(10L, "jar-designs/1/final.png");
        when(jarDesignRepository.findByJar_JarId(10L)).thenReturn(Optional.of(design));
        when(s3Presigner.presignGetObject(any(GetObjectPresignRequest.class)))
                .thenThrow(new IllegalStateException("presign failure"));

        JarDesignResponse response = service.findByJarId(10L);

        assertThat(response.designType()).isEqualTo(JarDesignType.AI);
        assertThat(response.imageUrl()).isNull();
        assertThat(response.imageExpiresAt()).isNull();
    }

    private JarDesign design(Long jarId, String s3Key) {
        User owner = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-1")
                .build();
        Jar jar = Jar.builder()
                .owner(owner)
                .name("커스텀 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(2)
                .openAt(LocalDateTime.now().plusDays(1))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", jarId);

        return JarDesign.builder()
                .jar(jar)
                .designType(JarDesignType.AI)
                .finalS3Key(s3Key)
                .slotCenterX(new BigDecimal("0.50000"))
                .slotCenterY(new BigDecimal("0.30000"))
                .slotSizeRatio(new BigDecimal("0.60000"))
                .build();
    }
}
