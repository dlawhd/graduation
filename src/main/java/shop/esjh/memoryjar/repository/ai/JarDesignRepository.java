package shop.esjh.memoryjar.repository.ai;

import org.springframework.data.jpa.repository.JpaRepository;
import shop.esjh.memoryjar.entity.ai.JarDesign;

import java.util.Optional;

/**
 * 최종 Jar의 선택 디자인을 조회하고 저장한다.
 */
public interface JarDesignRepository extends JpaRepository<JarDesign, Long> {

    Optional<JarDesign> findByJar_JarId(Long jarId);
}
