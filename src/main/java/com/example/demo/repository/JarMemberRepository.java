package com.example.demo.repository;

import com.example.demo.entity.JarMember;
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

    // 특정 유저의 멤버 row 찾기 (삭제된 것 포함)
    // 이 메서드가 중요한 이유:
    // 이미 한 번 들어왔다가 나간 사람은 새 row를 만들지 않고 기존 row를 재활성화해야 하니까..
    // joinByInvite()에서 재가입 처리할 때 꼭 필요
    Optional<JarMember> findByJar_JarIdAndUser_Id(Long jarId, Long userId);

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