package shop.esjh.memoryjar.repository.ai;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;

import java.util.Optional;

/**
 * Draft를 조회하고, 경쟁 상태가 있는 작업에서는 Draft 행을 잠가 직렬화한다.
 */
public interface JarDesignDraftRepository extends JpaRepository<JarDesignDraft, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT draft
            FROM JarDesignDraft draft
            WHERE draft.draftId = :draftId
            """)
    Optional<JarDesignDraft> findByDraftIdForUpdate(@Param("draftId") Long draftId);
}
