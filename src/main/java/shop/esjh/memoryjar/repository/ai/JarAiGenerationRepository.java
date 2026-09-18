package shop.esjh.memoryjar.repository.ai;

import org.springframework.data.jpa.repository.JpaRepository;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;

import java.util.Optional;

/**
 * Draft에 속한 AI 후보와 진행 중인 생성 작업을 조회한다.
 */
public interface JarAiGenerationRepository extends JpaRepository<JarAiGeneration, Long> {

    Optional<JarAiGeneration> findByGenerationIdAndDraft_DraftId(Long generationId, Long draftId);

    boolean existsByDraft_DraftIdAndStatus(Long draftId, JarAiGenerationStatus status);
}
