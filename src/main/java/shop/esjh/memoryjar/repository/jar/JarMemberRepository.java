package shop.esjh.memoryjar.repository.jar;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
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

    /*
     * 채팅 읽음 상태를 만들거나 수정하기 전에
     * 현재 사용자의 활성 멤버 row를 잠그고 조회한다.
     *
     * 왜 chat_read_state가 아니라 jar_members를 잠글까?
     *
     * - chat_read_state는 첫 읽음 요청 전에는 없을 수 있다.
     * - 없는 row는 DB에서 잠글 수 없다.
     * - 반면 현재 저금통 멤버라면 jar_members row는 반드시 존재한다.
     *
     * 따라서 같은 사용자에게 읽음 요청이 동시에 들어와도
     * 이 멤버 row를 기준으로 한 요청씩 차례대로 처리할 수 있다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select jm
        from JarMember jm
        where jm.jar.jarId = :jarId
          and jm.user.id = :userId
          and jm.deletedAt is null
        """)
    Optional<JarMember> findActiveMemberForUpdateByJarIdAndUserId(
            @Param("jarId") Long jarId,
            @Param("userId") Long userId
    );

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

    /**
     * 저금통별 active 멤버 수 조회 결과를 담는 Projection입니다.
     *
     * Projection은 쉽게 말하면
     * "엔티티 전체를 가져오지 않고, 필요한 값만 담는 작은 바구니"입니다.
     *
     * 여기서는 저금통 ID와 멤버 수만 필요합니다.
     */
    interface JarMemberCountView {
        Long getJarId();
        Long getMemberCount();
    }

    /**
     * 내가 속한 저금통별 내 역할 조회 결과를 담는 Projection입니다.
     *
     * 저금통 목록에서는 JarMember 전체가 아니라
     * jarId와 role만 있으면 화면을 만들 수 있습니다.
     */
    interface MyJarRoleView {
        Long getJarId();
        shop.esjh.memoryjar.enums.jar.JarRole getRole();
    }

    /**
     * 여러 저금통의 active 멤버 수를 한 번에 조회합니다.
     *
     * 기존 방식:
     * 저금통 20개면 count 쿼리 20번
     *
     * 개선 방식:
     * 저금통 ID 20개를 한 번에 넘겨서 count 쿼리 1번
     */
    @Query("""
            select jm.jar.jarId as jarId,
                   count(jm) as memberCount
            from JarMember jm
            where jm.jar.jarId in :jarIds
              and jm.deletedAt is null
            group by jm.jar.jarId
            """)
    List<JarMemberCountView> countActiveMembersByJarIds(
            @Param("jarIds") List<Long> jarIds
    );

    /**
     * 여러 저금통에서 현재 사용자의 역할을 한 번에 조회합니다.
     *
     * 기존 방식:
     * 저금통 20개면 내 멤버 정보 조회 쿼리 20번
     *
     * 개선 방식:
     * 저금통 ID 20개와 userId를 한 번에 넘겨서 조회 쿼리 1번
     */
    @Query("""
            select jm.jar.jarId as jarId,
                   jm.role as role
            from JarMember jm
            where jm.jar.jarId in :jarIds
              and jm.user.id = :userId
              and jm.deletedAt is null
            """)
    List<MyJarRoleView> findMyRolesByJarIdsAndUserId(
            @Param("jarIds") List<Long> jarIds,
            @Param("userId") Long userId
    );
}