package com.example.demo.repository.jar;

import com.example.demo.entity.jar.JarInvite;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface JarInviteRepository extends JpaRepository<JarInvite, Long> {

    // 코드 문자열로 초대장 1개 찾기
    // 단순 조회
    // 예: 코드 존재 여부 확인, 상세 조회
    Optional<JarInvite> findByCode(String code);

    // joinByInvite()용 초대장 잠금 조회
    // 동시에 같은 초대코드를 여러 명이 쓸 수 있으니까
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select ji
            from JarInvite ji
            where ji.code = :code
            """)
    Optional<JarInvite> findByCodeForUpdate(@Param("code") String code);

    // inviteId + jarId 로 초대장 찾기
    // 초대 폐기(revoke) 같은 관리자 기능에서 쓰기 좋아.
    Optional<JarInvite> findByInviteIdAndJar_JarId(Long inviteId, Long jarId);

    // 특정 저금통의 초대장 전체 목록
    // 관리자 화면에서 최근 생성 순으로 보여주기 좋게 정렬함
    @Query("""
            select ji
            from JarInvite ji
            where ji.jar.jarId = :jarId
            order by ji.createdAt desc
            """)
    List<JarInvite> findAllByJarIdOrderByCreatedAtDesc(@Param("jarId") Long jarId);

    // 지금 시점 기준으로 아직 사용 가능한 초대장만 조회
    // 폐기되지 않았고, 만료되지 않았고, 사용 횟수를 다 쓰지 않았어야 함
    @Query("""
            select ji
            from JarInvite ji
            where ji.jar.jarId = :jarId
              and ji.revokedAt is null
              and ji.expiresAt > :now
              and ji.usedCount < ji.maxUses
            order by ji.createdAt desc
            """)
    List<JarInvite> findActiveInvitesByJarId(
            @Param("jarId") Long jarId,
            @Param("now") LocalDateTime now
    );
}