package com.example.demo.repository.note;

import com.example.demo.entity.note.NoteComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NoteCommentRepository extends JpaRepository<NoteComment, Long> {

    // commentId로 댓글 1개 찾기
    Optional<NoteComment> findByCommentId(Long commentId);

    // 특정 쪽지(noteId)에 달린 댓글 목록을 오래된 순서대로 가져오는 메서드
    List<NoteComment> findByNote_NoteIdOrderByCreatedAtAscCommentIdAsc(Long noteId);

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


}
