package shop.esjh.memoryjar.service.jar;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.dto.jar.response.JarDesignResponse;
import shop.esjh.memoryjar.entity.ai.JarDesign;
import shop.esjh.memoryjar.repository.ai.JarDesignRepository;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 최종 Jar에 연결된 Optional JarDesign을 화면용 DTO로 변환한다.
 * 목록에서는 한 번의 DB 조회로 여러 디자인을 읽어 N+1 쿼리를 막는다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JarDesignViewService {

    private static final Logger log = LoggerFactory.getLogger(JarDesignViewService.class);

    private final JarDesignRepository jarDesignRepository;
    private final S3Presigner s3Presigner;
    private final S3Properties s3Properties;

    /** Jar 상세 화면에서 사용할 디자인 한 건을 조회한다. 디자인이 없으면 기존 Theme Jar를 위해 null을 반환한다. */
    public JarDesignResponse findByJarId(Long jarId) {
        return jarDesignRepository.findByJar_JarId(jarId)
                .map(this::toResponse)
                .orElse(null);
    }

    /** Jar 목록 한 페이지에 포함된 디자인을 한 번에 조회해 Jar ID 기준으로 반환한다. */
    public Map<Long, JarDesignResponse> findByJarIds(Collection<Long> jarIds) {
        if (jarIds == null || jarIds.isEmpty()) {
            return Collections.emptyMap();
        }

        Map<Long, JarDesignResponse> responses = new LinkedHashMap<>();
        for (JarDesign design : jarDesignRepository.findByJar_JarIdIn(jarIds)) {
            responses.put(design.getJar().getJarId(), toResponse(design));
        }
        return Collections.unmodifiableMap(responses);
    }

    /**
     * S3 Key 자체는 브라우저에 노출하지 않고 짧은 Presigned GET URL로 바꾼다.
     * URL 발급만 실패한 경우에도 Jar 상세 전체가 사라지지 않도록 이미지 URL만 null로 둔다.
     */
    private JarDesignResponse toResponse(JarDesign design) {
        int expiresInSeconds = s3Properties.getPresignExpSeconds();
        String imageUrl = null;
        OffsetDateTime imageExpiresAt = null;

        if (expiresInSeconds > 0 && hasText(s3Properties.getBucket()) && hasText(design.getFinalS3Key())) {
            try {
                imageUrl = s3Presigner.presignGetObject(
                                GetObjectPresignRequest.builder()
                                        .signatureDuration(Duration.ofSeconds(expiresInSeconds))
                                        .getObjectRequest(GetObjectRequest.builder()
                                                .bucket(s3Properties.getBucket())
                                                .key(design.getFinalS3Key())
                                                .responseContentType("image/png")
                                                .build())
                                        .build())
                        .url()
                        .toString();
                imageExpiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(expiresInSeconds);
            } catch (RuntimeException exception) {
                // 사용자 화면에는 내부 S3 정보와 SDK 예외를 노출하지 않고 재조회 가능한 빈 URL만 전달한다.
                log.warn("Jar 최종 디자인 미리보기 URL 발급에 실패했습니다. jarId={}",
                        design.getJar().getJarId());
            }
        }

        return new JarDesignResponse(
                design.getDesignType(),
                imageUrl,
                imageExpiresAt,
                design.getSlotCenterX(),
                design.getSlotCenterY(),
                design.getSlotSizeRatio()
        );
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
