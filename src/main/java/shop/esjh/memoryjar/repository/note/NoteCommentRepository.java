package shop.esjh.memoryjar.repository.note;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;
import shop.esjh.memoryjar.entity.note.NoteComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;

public interface NoteCommentRepository extends JpaRepository<NoteComment, Long> {

    // commentId로 댓글 1개 찾기
    Optional<NoteComment> findByCommentId(Long commentId);

    // 특정 쪽지(noteId)에 달린 댓글 목록을 오래된 순서대로 가져오는 메서드
    @EntityGraph(attributePaths = "user")
    List<NoteComment> findByNote_NoteIdOrderByCreatedAtAscCommentIdAsc(Long noteId);

    // 작성자만 함께 읽는다. 컬렉션 fetch join을 하지 않아 DB LIMIT가 실제로 적용된다.
    @Query("""
            select c from NoteComment c join fetch c.user
            where c.note.noteId = :noteId and c.commentId > :cursor order by c.commentId asc
            """)
    List<NoteComment> findPageAfter(@Param("noteId") Long noteId, @Param("cursor") Long cursor,
                                   Pageable pageable);

    // 알림 대상의 조상 경로만 찾기 위한 가벼운 관계 정보다. 본문과 작성자는 가져오지 않는다.
    @Query("select c.commentId as id, c.parentComment.commentId as parentId from NoteComment c where c.note.noteId = :noteId")
    List<CommentLink> findCommentLinks(@Param("noteId") Long noteId);

    @Query("select c from NoteComment c join fetch c.user where c.note.noteId = :noteId and c.commentId in :ids")
    List<NoteComment> findPathItems(@Param("noteId") Long noteId, @Param("ids") List<Long> ids);

    interface CommentLink {
        Long getId();
        Long getParentId();
    }

    // 삭제할 하위 댓글은 본문·작성자를 읽지 않고 ID만 작은 묶음으로 탐색한다.
    @Query("select c.commentId from NoteComment c where c.parentComment.commentId in :parents")
    List<Long> findChildIds(@Param("parents") List<Long> parents);

    @Modifying(flushAutomatically = true)
    @Query("""
            update NoteComment c set c.deletedAt = :now, c.updatedAt = :now
            where c.commentId in :ids and c.deletedAt is null
            """)
    int softDeleteIds(@Param("ids") List<Long> ids, @Param("now") LocalDateTime now);

    // 특정 저금통의 특정 쪽지 안에, 특정 댓글이 실제로 속해 있는지 안전하게 확인할 때 쓰는 메서드
    Optional<NoteComment> findByCommentIdAndNote_NoteId(Long commentId, Long noteId);

    /*
     * 특정 댓글 바로 아래에 달린 답글들을 찾는다.
     *
     * 예:
     * 댓글 A
     * └ 답글 B
     *   └ 답글 C
     *
     * parentCommentId가 A이면 B만 찾고,
     * parentCommentId가 B이면 C만 찾는다.
     */
    List<NoteComment> findByParentComment_CommentIdOrderByCreatedAtAscCommentIdAsc(
            Long parentCommentId
    );

    /*
     * 특정 댓글 아래에 대댓글이 하나라도 있는지 확인하는 메서드

     * 어디에 쓰면 좋을까?
     * - 부모 댓글 삭제 전에
     *   "이 댓글 밑에 답글이 남아 있는지" 검사할 때
     * existsByParentComment_CommentId(1) -> true
     */
    boolean existsByParentComment_CommentId(Long parentCommentId);

    /*
     * 특정 쪽지에 달린 댓글 개수 세기
     *
     * 이 값은 어디에 쓸까?
     * - 쪽지 목록 카드에 "댓글 3" 표시
     * - 상세 화면 상단에 댓글 수 표시
     *
     * 이런 곳에 쓰기 좋음
     */
    long countByNote_NoteId(Long noteId);

    /*
     * 여러 쪽지의 댓글 개수를 한 번에 조회한다.
     *
     * 왜 필요할까?
     * - 쪽지 목록 화면에서는 여러 쪽지가 한 번에 보인다.
     * - 쪽지마다 countByNote_NoteId를 반복 호출하면 쪽지 개수만큼 쿼리가 나갈 수 있다.
     * - IN + GROUP BY로 한 번에 조회하면 DB 왕복 횟수를 줄일 수 있다.
     *
     * 주의할 점:
     * - 댓글이 0개인 쪽지는 결과에 나오지 않을 수 있다.
     * - 그래서 Service에서 getOrDefault(noteId, 0L)로 0개를 처리한다.
     */
    @Query("""
        select c.note.noteId as noteId,
               count(c.commentId) as commentCount
        from NoteComment c
        where c.note.noteId in :noteIds
        group by c.note.noteId
        """)
    List<CommentCountView> countCommentsByNoteIds(@Param("noteIds") List<Long> noteIds);

    interface CommentCountView {
        Long getNoteId();

        Long getCommentCount();
    }

}
