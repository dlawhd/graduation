package shop.esjh.memoryjar.repository.ai;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import shop.esjh.memoryjar.entity.ai.JarDesign;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 최종 Jar의 선택 디자인을 조회하고 저장한다.
 */
public interface JarDesignRepository extends JpaRepository<JarDesign, Long> {

    /** 삭제된 저금통의 디자인도 참조를 보존한다. 보상 삭제 판단에서 필터로 숨겨서는 안 된다. */
    @org.springframework.data.jpa.repository.Query(value = "SELECT final_s3_key FROM jar_designs WHERE jar_id = :jarId", nativeQuery = true)
    Optional<String> findPermanentKeyIncludingDeleted(@org.springframework.data.repository.query.Param("jarId") Long jarId);

    @EntityGraph(attributePaths = "selectedGeneration")
    Optional<JarDesign> findByJar_JarId(Long jarId);

    /** 목록 한 페이지의 Optional 디자인을 한 번에 조회해 N+1 쿼리를 막는다. */
    @EntityGraph(attributePaths = "selectedGeneration")
    List<JarDesign> findByJar_JarIdIn(Collection<Long> jarIds);
}
