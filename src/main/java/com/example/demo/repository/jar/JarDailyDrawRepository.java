package com.example.demo.repository.jar;

import com.example.demo.entity.jar.JarDailyDraw;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Optional;

// "오늘의 추억 한 장" 뽑기 기록을 DB에서 찾고 저장하는 역할
public interface JarDailyDrawRepository extends JpaRepository<JarDailyDraw, Long> {

    /*
     * Daily Draw 기록 ID로 1개 찾기
     *
     * 예:
     * - drawId = 1번 기록을 상세 조회하고 싶을 때 사용한다.
     */
    Optional<JarDailyDraw> findByDrawId(Long drawId);

    /*
     * 특정 저금통의 특정 날짜 Daily Draw 기록을 찾는다.
     *
     * 예:
     * - jarId = 10
     * - drawDate = 2026-05-04
     *
     * 이 메서드는 "오늘 이미 뽑힌 카드가 있나?" 확인할 때 가장 많이 쓴다.
     */
    Optional<JarDailyDraw> findByJar_JarIdAndDrawDate(Long jarId, LocalDate drawDate);

    /*
     * 특정 저금통의 특정 날짜 Daily Draw 기록이 이미 있는지 확인한다.
     *
     * 예:
     * - 오늘 카드가 이미 있으면 true
     * - 아직 없으면 false
     *
     * 단순 존재 여부만 필요할 때 Optional 조회보다 가볍게 사용할 수 있다.
     */
    boolean existsByJar_JarIdAndDrawDate(Long jarId, LocalDate drawDate);

    /*
     * 오늘 카드 조회용 메서드
     *
     * note와 note.author를 join fetch 하는 이유:
     * - Daily Draw 응답에는 쪽지 제목, 내용, 작성자 이름이 필요하다.
     * - note를 조회한 뒤 author를 또 따로 조회하면 N+1 문제가 생길 수 있다.
     * - 그래서 오늘 카드 1개를 가져올 때 쪽지와 작성자를 한 번에 가져온다.
     *
     * 쉽게 말하면:
     * - "오늘 카드 기록 + 뽑힌 쪽지 + 쪽지 작성자"를 한 번에 가져오는 메서드다.
     */
    @Query("""
            select d
            from JarDailyDraw d
            join fetch d.note n
            join fetch n.author
            where d.jar.jarId = :jarId
              and d.drawDate = :drawDate
            """)
    Optional<JarDailyDraw> findTodayWithNoteByJarIdAndDrawDate(
            @Param("jarId") Long jarId,
            @Param("drawDate") LocalDate drawDate
    );

    /*
     * Daily Draw 히스토리 조회용 메서드
     *
     * note와 note.author를 join fetch 하는 이유:
     * - 히스토리 목록에서도 제목, 작성자 이름을 보여줄 수 있다.
     * - 여러 개의 기록을 가져올 때 작성자를 하나씩 따로 조회하면 쿼리가 많아질 수 있다.
     *
     * countQuery를 따로 둔 이유:
     * - Page를 쓰려면 전체 개수를 세는 count 쿼리가 필요하다.
     * - fetch join이 들어간 조회 쿼리와 count 쿼리는 역할이 다르기 때문에 분리해두면 안전하다.
     */
    @Query(
            value = """
                    select d
                    from JarDailyDraw d
                    join fetch d.note n
                    join fetch n.author
                    where d.jar.jarId = :jarId
                    order by d.drawDate desc, d.drawId desc
                    """,
            countQuery = """
                    select count(d)
                    from JarDailyDraw d
                    where d.jar.jarId = :jarId
                    """
    )
    Page<JarDailyDraw> findHistoryByJarId(
            @Param("jarId") Long jarId,
            Pageable pageable
    );
}