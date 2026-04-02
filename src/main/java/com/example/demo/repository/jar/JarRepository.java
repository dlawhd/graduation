package com.example.demo.repository.jar;

import com.example.demo.entity.jar.Jar;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface JarRepository extends JpaRepository<Jar, Long> {

    // 삭제되지 않은 저금통 1개 찾기
    // Jar 엔티티에 @SQLRestriction("deleted_at IS NULL")가 붙어 있으면 soft delete 된 데이터는 자동으로 제외.
    Optional<Jar> findByJarId(Long jarId);

    // 저금통 상세 조회용
    // owner를 같이 가져오면 나중에 service / dto 변환할 때 추가 조회가 줄어들 수 있음
    @Query("""
            select j
            from Jar j
            join fetch j.owner
            where j.jarId = :jarId
            """)
    Optional<Jar> findDetailByJarId(@Param("jarId") Long jarId);

    // 내가 속한 저금통 목록 조회
    @Query(
            value = """
                    select j
                    from JarMember jm
                    join jm.jar j
                    where jm.user.id = :userId
                      and jm.deletedAt is null
                    order by j.updatedAt desc
                    """,
            countQuery = """
                    select count(j)
                    from JarMember jm
                    join jm.jar j
                    where jm.user.id = :userId
                      and jm.deletedAt is null
                    """
    )
    Page<Jar> findMyJarsByUserId(@Param("userId") Long userId, Pageable pageable);

    //joinByInvite()용 저금통 잠금 조회
    // 왜 잠그냐?
    // 동시에 여러 사람이 초대코드로 들어올 때 둘 다 "아직 자리 있네?"라고 보면 정원 초과가 날 수 있음
    // 그래서 정원 체크 직전에 저금통 row를 잠그는 용도로 쓸 수 있음
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select j
            from Jar j
            where j.jarId = :jarId
            """)
    Optional<Jar> findByJarIdForUpdate(@Param("jarId") Long jarId);

    @Query("""
            select j
            from Jar j
            where j.openAt <= :now
              and not exists (
                  select 1
                  from JarOpenEvent e
                  where e.jar = j
              )
            order by j.openAt asc
            """)
    List<Jar> findDueJarsWithoutOpenEvent(@Param("now") LocalDateTime now);

    // OWNER 체크할 때 간단하게 쓸 수 있는 메서드
    //  예: 저금통 삭제, owner 전용 기능
    boolean existsByJarIdAndOwner_Id(Long jarId, Long ownerId);
}