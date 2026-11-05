package shop.esjh.memoryjar.repository.note;

import shop.esjh.memoryjar.entity.note.Note;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface NoteRepository extends JpaRepository<Note, Long> {
    /** 작성자 조건을 목록과 전체 개수 조회에 모두 적용해 다른 사람의 작성 여부도 노출하지 않는다. */
    @Query(value=LIST_ROW_SELECT+SEARCH_FILTER+" and n.author.id = :authorId order by n.createdAt desc, n.noteId desc",
            countQuery="select count(n) from Note n "+SEARCH_FILTER+" and n.author.id = :authorId")
    Page<NoteListRow> searchOwnListRows(@Param("jarId") Long jarId,@Param("authorId") Long authorId,
            @Param("q") String q,@Param("tag") String tag,Pageable pageable);

    // API 응답 DTO와 분리한 목록 전용 값 조회다. 작성자 엔티티 전체나 변경 감지 상태를 읽지 않는다.
    String LIST_ROW_SELECT = """
            select new shop.esjh.memoryjar.repository.note.NoteListRow(
                n.noteId, n.title, n.content, n.noteDate, n.location,
                a.id, a.name, n.isEncrypted, n.createdAt, n.tags)
            from Note n join n.author a
            """;
    String SEARCH_FILTER = """
            where n.jar.jarId = :jarId
              and (:q = '' or lower(n.title) like :q escape '!'
                or lower(n.content) like :q escape '!' or lower(n.location) like :q escape '!')
              and (:tag = '' or function('json_search', lower(cast(n.tags as string)), 'one', :tag, '!') is not null)
            """;

    /** 기존 목록의 정렬·전체 개수·soft delete 규칙은 그대로 사용한다. */
    @Query(value = LIST_ROW_SELECT + "where n.jar.jarId = :jarId order by n.createdAt desc, n.noteId desc",
            countQuery = "select count(n) from Note n where n.jar.jarId = :jarId")
    Page<NoteListRow> findListRowsByJarId(@Param("jarId") Long jarId, Pageable pageable);

    /** 검색은 미리보기 앞부분이 아니라 전체 본문에서 수행한다. 목록·개수 조회가 같은 조건을 공유한다. */
    @Query(value = LIST_ROW_SELECT + SEARCH_FILTER + "order by n.createdAt desc, n.noteId desc",
            countQuery = "select count(n) from Note n " + SEARCH_FILTER)
    Page<NoteListRow> searchListRowsByJarId(@Param("jarId") Long jarId, @Param("q") String q,
                                          @Param("tag") String tag, Pageable pageable);

    /** 없는 리액션 행 대신 항상 존재하는 쪽지를 잠가 첫 등록도 순서대로 처리한다. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select n from Note n where n.noteId = :noteId and n.jar.jarId = :jarId")
    Optional<Note> findByJarIdAndNoteIdForUpdate(@Param("jarId") Long jarId, @Param("noteId") Long noteId);

    // 삭제되지 않은 쪽지 1개 찾기
    Optional<Note> findByNoteId(Long noteId);

    // 컬렉션 fetch join 없이 작성자만 함께 읽어 페이지 크기와 전체 개수를 정확하게 유지한다.
    @Query(value = "select n from Note n join fetch n.author " + SEARCH_FILTER + "order by n.createdAt desc, n.noteId desc",
            countQuery = "select count(n) from Note n " + SEARCH_FILTER)
    Page<Note> searchByJarId(@Param("jarId") Long jarId, @Param("q") String q,
            @Param("tag") String tag, Pageable pageable);

    /*
     * 특정 저금통의 쪽지 목록을 조회한다.
     *
     * 왜 author를 join fetch 하냐면?
     * - 쪽지 목록 응답에는 작성자 id와 이름이 필요하다.
     * - Note.author는 LAZY라서 그냥 Note만 가져오면 작성자를 꺼낼 때 추가 조회가 생길 수 있다.
     * - 그래서 쪽지와 작성자를 한 번에 가져와서 목록 조회 성능을 안정화한다.
     *
     * countQuery를 따로 둔 이유:
     * - Page 조회는 전체 개수도 같이 세야 한다.
     * - fetch join은 목록 조회에는 좋지만 count 쿼리에는 맞지 않아서,
     *   개수 조회용 쿼리는 fetch join 없이 따로 작성한다.
     */
    @Query(
            value = """
                select n
                from Note n
                join fetch n.author
                where n.jar.jarId = :jarId
                order by n.createdAt desc, n.noteId desc
                """,
            countQuery = """
                select count(n)
                from Note n
                where n.jar.jarId = :jarId
                """
    )
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
     * Daily Draw 대상으로 볼 수 있는 전체 쪽지 개수를 센다.
     *
     * 쉽게 말하면:
     * - 이 저금통 안에 들어있는 쪽지가 총 몇 장인지 확인한다.
     * - 이 값이 0이면 애초에 받을 추억 쪽지가 없는 상태다.
     */
    @Query("""
        select count(n)
        from Note n
        where n.jar.jarId = :jarId
        """)
    long countDrawableNotesByJarId(
            @Param("jarId") Long jarId
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
