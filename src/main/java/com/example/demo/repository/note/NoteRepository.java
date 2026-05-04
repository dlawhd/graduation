package com.example.demo.repository.note;

import com.example.demo.entity.note.Note;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface NoteRepository extends JpaRepository<Note, Long> {

    // 삭제되지 않은 쪽지 1개 찾기
    Optional<Note> findByNoteId(Long noteId);

    // 특정 저금통의 쪽지 목록 조회
    // 최신순으로 보여주려고 createdAt 내림차순 정렬
    @Query("""
            select n
            from Note n
            where n.jar.jarId = :jarId
            order by n.createdAt desc
            """)
    Page<Note> findByJarId(@Param("jarId")
                           Long jarId, Pageable pageable);

    // 특정 저금통 안의 특정 쪽지 1개 찾기
    // 남의 저금통 쪽지를 잘못 조회하지 않게 jarId도 같이 확인
    @Query("""
            select n
            from Note n
            where n.noteId = :noteId
              and n.jar.jarId = :jarId
            """)
    Optional<Note> findByJarIdAndNoteId(
            @Param("jarId") Long jarId,
            @Param("noteId") Long noteId
    );

    /*
     * Daily Draw 후보 쪽지 개수 세기
     *
     * 여기서 후보란?
     * - 이 저금통에 들어있는 쪽지이면서 아직 Daily Draw로 한 번도 뽑히지 않은 쪽지다.
     *
     * 왜 이미 뽑힌 쪽지를 제외하냐면?
     * - "오늘의 추억 한 장"은 하루에 새 추억 하나를 여는 기능이다.
     * - 같은 쪽지가 다음 날 또 나오면 사용자가 아쉬울 수 있다.
     *
     * 예:
     * - 저금통에 쪽지 10장 있음
     * - 그중 3장은 이미 뽑힘
     * - 후보 개수는 7장
     */
    @Query("""
            select count(n)
            from Note n
            where n.jar.jarId = :jarId
              and not exists (
                  select d.drawId
                  from JarDailyDraw d
                  where d.jar.jarId = :jarId
                    and d.note.noteId = n.noteId
              )
            """)
    long countDailyDrawCandidatesByJarId(
            @Param("jarId") Long jarId
    );

    /*
     * Daily Draw 후보 쪽지 목록 조회
     *
     * 이 메서드는 PageRequest.of(randomOffset, 1)과 같이 사용한다.
     *
     * 예:
     * - 아직 안 뽑힌 후보 쪽지가 7장
     * - 랜덤 숫자가 3
     * - PageRequest.of(3, 1)을 넣으면 후보 중 4번째 쪽지 1장을 가져온다.
     *
     * 중요한 점:
     * - 이미 jar_daily_draws에 기록된 쪽지는 제외한다.
     * - 그래서 한 번 뽑힌 쪽지는 다음 Daily Draw 후보에 다시 들어오지 않는다.
     *
     * note.author를 join fetch 하는 이유:
     * - Daily Draw 응답에는 작성자 이름이 필요하다.
     * - 쪽지를 가져온 뒤 작성자를 또 조회하면 쿼리가 더 늘어날 수 있다.
     * - 그래서 쪽지와 작성자를 한 번에 가져온다.
     *
     * noteId 오름차순으로 정렬하는 이유:
     * - 랜덤 offset을 쓰려면 정렬 기준이 고정되어 있어야 한다.
     * - 정렬 기준이 흔들리면 같은 offset이어도 결과가 불안정할 수 있다.
     */
    @Query(
            value = """
                    select n
                    from Note n
                    join fetch n.author
                    where n.jar.jarId = :jarId
                      and not exists (
                          select d.drawId
                          from JarDailyDraw d
                          where d.jar.jarId = :jarId
                            and d.note.noteId = n.noteId
                      )
                    order by n.noteId asc
                    """,
            countQuery = """
                    select count(n)
                    from Note n
                    where n.jar.jarId = :jarId
                      and not exists (
                          select d.drawId
                          from JarDailyDraw d
                          where d.jar.jarId = :jarId
                            and d.note.noteId = n.noteId
                      )
                    """
    )
    Page<Note> findDailyDrawCandidatesByJarId(
            @Param("jarId") Long jarId,
            Pageable pageable
    );
}