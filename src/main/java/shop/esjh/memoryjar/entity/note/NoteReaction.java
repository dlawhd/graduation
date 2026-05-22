package shop.esjh.memoryjar.entity.note;

import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.enums.note.NoteReactionEmoji;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

//어떤 쪽지(note)에 어떤 사용자(user)가 어떤 감정(emoji)으로 반응했는지
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(
        name = "note_reactions",
        uniqueConstraints = {
                // 같은 사용자가 같은 쪽지에 리액션을 2개 이상 만들지 못하게 막는 규칙
                @UniqueConstraint(
                        name = "uk_note_reactions_note_user",
                        columnNames = {"note_id", "user_id"}
                )
        }
)
@EntityListeners(AuditingEntityListener.class)
public class NoteReaction {

    // 리액션 하나마다 붙는 고유 번호표
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "reaction_id")
    private Long reactionId;

    // 어떤 쪽지에 단 리액션인지 저장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "note_id", nullable = false)
    private Note note;

    // 누가 누른 리액션인지 저장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // 어떤 감정 리액션인지 저장
    // ORDINAL(숫자) 말고 STRING(문자)으로 저장해야
    // DB에 LOVE, SMILE 같은 이름이 그대로 들어가서 안전하고 보기 쉬움
    @Enumerated(EnumType.STRING)
    @Column(name = "emoji", nullable = false, length = 30)
    private NoteReactionEmoji emoji;

    // 처음 리액션을 만든 시간
    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // 마지막으로 리액션이 바뀐 시간
    // 예: LOVE -> SMILE 로 변경되면 이 시간이 갱신
    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /*
     * Builder 생성자
     * 리액션을 새로 만들 때 사용
     * 예:
     * - note = 10번 쪽지
     * - user = 3번 사용자
     * - emoji = LOVE
     */
    @Builder
    private NoteReaction(Note note, User user, NoteReactionEmoji emoji) {
        this.note = note;
        this.user = user;
        this.emoji = emoji;
    }

    /*
     * 리액션 종류를 바꾸는 메서드
     * 예:
     * - 원래 LOVE 였는데 SMILE 로 바꾸고 싶을 때 사용
     */
    public void changeEmoji(NoteReactionEmoji emoji) {
        this.emoji = emoji;
    }

    /*
     * 이 리액션이 특정 사용자의 것인지 확인하는 메서드
     *
     * 서비스에서
     * "내가 누른 리액션이 맞나?"
     * 확인할 때 읽기 쉽게 쓰려고 만든 작은 도우미 메서드
     */
    public boolean isOwner(Long userId) {
        return user != null && user.getId().equals(userId);
    }

    /*
     * 이 리액션이 특정 쪽지의 것인지 확인하는 메서드
     *
     * 나중에 서비스 로직에서
     * "이 리액션이 정말 이 noteId에 속한 게 맞나?"
     * 확인할 때 사용할 수 있음
     */
    public boolean isNote(Long noteId) {
        return note != null && note.getNoteId().equals(noteId);
    }
}