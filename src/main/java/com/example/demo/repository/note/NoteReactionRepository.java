package com.example.demo.repository.note;

import com.example.demo.entity.note.NoteReaction;
import com.example.demo.enums.note.NoteReactionEmoji;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

// 레포지토리는 "DB에서 실제로 찾고 저장하는 일"을 맡기 때문
public interface NoteReactionRepository extends JpaRepository<NoteReaction, Long> {

    // 특정 사용자가 특정 쪽지에 이미 남긴 리액션이 있는지 찾는 메서드
    Optional<NoteReaction> findByNote_NoteIdAndUser_Id(Long noteId, Long userId);

    // 특정 쪽지에 달린 전체 리액션 개수를 구하는 메서드
    // 이 값은 필요하면 상세 화면에서 "총 5명이 반응했어요" 같은 문구를 보여줄 때 씀
    long countByNote_NoteId(Long noteId);

    /*
     * 여러 쪽지에 대한 리액션 요약을 "한 번에" 가져오는 쿼리
     *
     * 왜 이렇게 하냐면?
     * 쪽지 목록 화면에서 카드가 여러 개 있을 때, 쪽지마다 하나씩 따로 DB를 조회하면 비효율적일 수 있음
     * 그래서
     * - noteId 목록을 한 번에 넣고
     * - noteId별 / emoji별 개수를 묶어서 가져오면
     * 더 깔끔하고 효율적으로 처리할 수 있음
     *
     * 반환 예시 느낌:
     * - noteId=10, emoji=LOVE, count=2
     * - noteId=10, emoji=SMILE, count=1
     * - noteId=11, emoji=CHEER, count=3
     */
    @Query("""
            select
                r.note.noteId as noteId,
                r.emoji as emoji,
                count(r) as count
            from NoteReaction r
            where r.note.noteId in :noteIds
            group by r.note.noteId, r.emoji
            """)
    List<ReactionCountView> countGroupedByNoteIds(@Param("noteIds") List<Long> noteIds);

    // 특정 쪽지 1개에 대한 리액션 요약만 가져오는 쿼리
    // LOVE 몇 개, SMILE 몇 개 등
    @Query("""
            select
                r.note.noteId as noteId,
                r.emoji as emoji,
                count(r) as count
            from NoteReaction r
            where r.note.noteId = :noteId
            group by r.note.noteId, r.emoji
            """)
    List<ReactionCountView> countGroupedByNoteId(@Param("noteId") Long noteId);

    /*
     * 여러 쪽지에 대해 "내가 누른 리액션"만 한 번에 가져오는 쿼리

     * 예:
     * - userId = 1
     * - noteIds = [10, 11, 12]

     * 결과 예시:
     * - 10번 쪽지 -> LOVE
     * - 12번 쪽지 -> THANKFUL
     *
     */
    @Query("""
            select
                r.note.noteId as noteId,
                r.emoji as emoji
            from NoteReaction r
            where r.user.id = :userId
              and r.note.noteId in :noteIds
            """)
    List<MyReactionView> findMyReactionsByUserIdAndNoteIds(
            @Param("userId") Long userId,
            @Param("noteIds") List<Long> noteIds
    );

    /*
     * 목록 화면에서 "내가 누른 리액션"을 담아주는 작은 프로젝션
     */
    interface MyReactionView {
        Long getNoteId();
        NoteReactionEmoji getEmoji();
    }

    // 이 인터페이스는 "리액션 개수 묶음" 한 줄을 담는 작은 창고, 10번 쪽지에 LOVE가 3개 있어
    interface ReactionCountView {
        Long getNoteId();
        NoteReactionEmoji getEmoji();
        long getCount();
    }
}