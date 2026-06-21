package shop.esjh.memoryjar.repository.jar;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.jar.JarOpenEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface JarOpenEventRepository extends JpaRepository<JarOpenEvent, Long> {

    // 이 저금통이 이미 열렸는지 확인
    boolean existsByJar_JarId(Long jarId);

    // 상세 기록 1개 조회
    Optional<JarOpenEvent> findByJar_JarId(Long jarId);

    /*
     * 여러 저금통 중 이미 열린 저금통 ID만 한 번에 조회한다.
     *
     * 왜 필요할까?
     * - 목록 화면에서는 저금통이 여러 개 보인다.
     * - 저금통마다 existsByJar_JarId를 반복하면 쿼리가 저금통 개수만큼 늘어난다.
     * - IN 조건으로 한 번에 가져오면 목록 조회 비용을 줄일 수 있다.
     */
    @Query("""
        select e.jar.jarId
        from JarOpenEvent e
        where e.jar.jarId in :jarIds
        """)
    List<Long> findOpenedJarIdsByJarIds(@Param("jarIds") List<Long> jarIds);
}