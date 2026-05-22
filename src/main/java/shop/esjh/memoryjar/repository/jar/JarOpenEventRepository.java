package shop.esjh.memoryjar.repository.jar;

import shop.esjh.memoryjar.entity.jar.JarOpenEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface JarOpenEventRepository extends JpaRepository<JarOpenEvent, Long> {

    // 이 저금통이 이미 열렸는지 확인
    boolean existsByJar_JarId(Long jarId);

    // 상세 기록 1개 조회
    Optional<JarOpenEvent> findByJar_JarId(Long jarId);
}