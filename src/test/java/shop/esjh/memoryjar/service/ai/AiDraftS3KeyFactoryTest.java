package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Generation ID 기반 후보 S3 경로가 항상 재구성 가능한지 검증한다. */
class AiDraftS3KeyFactoryTest {

    private final AiDraftS3KeyFactory keyFactory = new AiDraftS3KeyFactory();

    @Test
    void candidateKey_usesOwnerDraftAndGenerationIds() {
        assertThat(keyFactory.candidateKey(1L, 10L, 100L))
                .isEqualTo("jar-design-drafts/generations/1/10/100.png");
    }

    @Test
    void candidateKey_rejectsMissingOrNonPositiveIds() {
        assertThatThrownBy(() -> keyFactory.candidateKey(1L, 0L, 100L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
