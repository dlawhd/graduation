package com.example.demo.entity.note;

import com.example.demo.entity.BaseEntity;
import com.example.demo.entity.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "note_comments")
@SQLDelete(sql = "UPDATE note_comments SET deleted_at = NOW(), updated_at = NOW() WHERE comment_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class NoteComment extends BaseEntity {

    // 댓글 하나마다 붙는 고유 번호표
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "comment_id")
    private Long commentId;

    // 어떤 쪽지에 달린 댓글인지 저장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "note_id", nullable = false)
    private Note note;

    // 누가 작성한 댓글인지 저장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // 댓글 본문
    // 길어질 수도 있으니 TEXT 타입에 맞춰 둔다.
    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    /*
     * Builder 생성자
     *
     * 새 댓글을 만들 때 사용
     * 예:
     * - note = 10번 쪽지
     * - user = 3번 사용자
     * - content = "이 날 진짜 너무 좋았다"
     */
    @Builder
    private NoteComment(Note note, User user, String content) {
        this.note = note;
        this.user = user;
        this.content = content;
    }

    // 댓글 내용을 수정하는 메서드
    public void updateContent(String content) {
        this.content = content;
    }

    /*
     * 이 댓글이 특정 사용자가 쓴 댓글인지 확인하는 메서드

     * 예:
     * - 현재 로그인한 사용자 id가 5
     * - 이 댓글 작성자도 5
     * -> true

     * 수정/삭제 권한 체크할 때 읽기 쉽게 쓰려고 만든 메서드
     */
    public boolean isOwner(Long userId) {
        return user != null && user.getId().equals(userId);
    }

    /*
     * 이 댓글이 특정 쪽지에 속한 댓글인지 확인하는 메서드
     
     * 예:
     * - 지금 요청 URL의 noteId가 10
     * - 실제 이 댓글의 noteId도 10
     * -> true
    
     * 서비스에서 안전하게 한 번 더 확인하고 싶을 때 쓸 수 있음
     */
    public boolean isNote(Long noteId) {
        return note != null && note.getNoteId().equals(noteId);
    }
}