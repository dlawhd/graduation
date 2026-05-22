package shop.esjh.memoryjar.repository.jar;

import shop.esjh.memoryjar.entity.jar.JarMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JarMemberRepository extends JpaRepository<JarMember, Long> {

    //  현재 active 멤버인지 확인
    //  deleted_at 이 null 이면 지금 이 저금통에 참여 중인 상태라고 보면 됌
    boolean existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(Long jarId, Long userId);

    //  특정 유저의 현재 active 멤버 row 찾기
    //  권한 확인이나 내 역할 확인할 때 자주 쓸 수 있어.
    Optional<JarMember> findByJar_JarIdAndUser_IdAndDeletedAtIsNull(Long jarId, Long userId);

    /**
     * 삭제된 멤버까지 포함해서 jar_members row를 찾습니다.
     *
     * 왜 native query를 쓰나요?
     * JarMember 엔티티에는 @SQLRestriction("deleted_at IS NULL")이 있어서,
     * 일반 JPA 조회를 하면 deleted_at이 있는 row는 자동으로 제외됩니다.
     *
     * 그런데 재가입 처리에서는 "예전에 나간 row"를 다시 찾아서 살려야 합니다.
     * 그래서 직접 SQL을 작성해서 deleted_at 조건 없이 조회합니다.
     */
    @Query(value = """
            SELECT *
            FROM jar_members
            WHERE jar_id = :jarId
              AND user_id = :userId
            """, nativeQuery = true)
    Optional<JarMember> findAnyByJarIdAndUserIdIncludingDeleted(
            @Param("jarId") Long jarId,
            @Param("userId") Long userId
    );

    // 현재 active 멤버 수 세기
    // 정원(maxMembers) 체크할 때 사용
    long countByJar_JarIdAndDeletedAtIsNull(Long jarId);

    //  멤버 목록 조회
    //  user를 join fetch 해서 닉네임, 프로필 이미지 등 DTO 만들 때 N+1 문제를 줄여줌
    @Query("""
            select jm
            from JarMember jm
            join fetch jm.user u
            where jm.jar.jarId = :jarId
              and jm.deletedAt is null
            order by jm.joinedAt asc
            """)
    List<JarMember> findActiveMembersWithUserByJarId(@Param("jarId") Long jarId);

    // ADMIN / OWNER 권한 검사할 때 쓸 수 있는 메서드
    // 예: 초대코드 생성, 멤버 강퇴, 관리자 기능 접근
    @Query("""
            select jm
            from JarMember jm
            where jm.jar.jarId = :jarId
              and jm.user.id = :userId
              and jm.deletedAt is null
            """)
    Optional<JarMember> findActiveRoleByJarIdAndUserId(
            @Param("jarId") Long jarId,
            @Param("userId") Long userId
    );
}