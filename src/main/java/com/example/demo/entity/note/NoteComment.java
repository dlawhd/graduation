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

import java.util.ArrayList;
import java.util.List;

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
     * 이 댓글의 부모 댓글

     * - null 이면 일반 댓글
     * - 값이 있으면 대댓글
     *
     * 예:
     * 댓글 A
     *   └ 대댓글 B
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_comment_id")
    private NoteComment parentComment;

    /*
     * 이 댓글 아래에 달린 대댓글 목록

     * 예:
     * 댓글 A
     *   ├ 대댓글 B
     *   └ 대댓글 C
     */
    @OrderBy("createdAt ASC, commentId ASC")
    @OneToMany(mappedBy = "parentComment")
    private List<NoteComment> children = new ArrayList<>();

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
    private NoteComment(Note note, User user, String content, NoteComment parentComment) {
        this.note = note;
        this.user = user;
        this.content = content;
        this.parentComment = parentComment;
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

    /*
     * 이 댓글이 대댓글인지 확인하는 메서드

     * - parentComment가 있으면 대댓글
     * - 없으면 일반 댓글
     */
    public boolean isReply() {
        return parentComment != null;
    }

    /*
     * 이 댓글이 최상위 댓글(일반 댓글)인지 확인하는 메서드
     *
     * - parentComment가 없으면 일반 댓글
     */
    public boolean isRootComment() {
        return parentComment == null;
    }

    /*
     * 이 댓글에 대댓글이 하나라도 있는지 확인하는 메서드

     * 삭제 정책에서 "답글이 있는 부모 댓글은 삭제 막기"같은 규칙을 둘 때 사용
     */
    public boolean hasChildren() {
        return children != null && !children.isEmpty();
    }
}