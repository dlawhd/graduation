package shop.esjh.memoryjar.entity.note;

import shop.esjh.memoryjar.entity.BaseEntity;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.converter.StringListJsonConverter;
import shop.esjh.memoryjar.entity.jar.Jar;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

// 어떤 저금통에 들어있는 쪽지인지, 누가 쓴 쪽지인지, 제목, 내용, 날짜, 장소가 무엇인지
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "notes")
@SQLDelete(sql = "UPDATE notes SET deleted_at = NOW(), updated_at = NOW() WHERE note_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Note extends BaseEntity {

    // 쪽지 번호표
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "note_id")
    private Long noteId;

    // 어느 저금통에 들어있는 쪽지인지 저장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "jar_id", nullable = false)
    private Jar jar;

    // 누가 이 쪽지를 썼는지 저장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id", nullable = false)
    private User author;

    // 제목은 필수
    @Column(name = "title", nullable = false, length = 100)
    private String title;

    // 쪽지 본문
    @Column(name = "content", nullable = false, columnDefinition = "LONGTEXT")
    private String content;

    // 나중에 AES 암호화 모드가 들어오면 사용할 스위치야.
    // false = 일반 텍스트, true  = 암호화된 텍스트
    @Column(name = "is_encrypted", nullable = false)
    private boolean isEncrypted;

    // 실제 추억이 있었던 날짜
    @Column(name = "note_date")
    private LocalDate noteDate;

    // 장소는 선택값
    @Column(name = "location", length = 100)
    private String location;

    // 태그 목록
    // DB에는 tags_json(TEXT)로 저장되고, 자바에서는 List<String>으로 사용
    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "tags_json", columnDefinition = "TEXT")
    private List<String> tags = new ArrayList<>();

    // Builder로 Note를 만들 때 쓰는 생성자
    // Builder 쓰는 이유 : 나중에 필드가 늘면 더 복잡해짐, 순서를 헷갈리기 쉬움, 한눈에 보기 쉬움
    @Builder
    private Note(
            Jar jar,
            User author,
            String title,
            String content,
            boolean isEncrypted,
            LocalDate noteDate,
            String location,
            List<String> tags
    ) {
        this.jar = jar;
        this.author = author;
        this.title = title;
        this.content = content;
        this.isEncrypted = isEncrypted;
        this.noteDate = noteDate;
        this.location = location;
        this.tags = tags == null ? new ArrayList<>() : new ArrayList<>(tags);
    }

    // 쪽지 수정할 때 사용하는 메서드
    public void update(
            String title,
            String content,
            LocalDate noteDate,
            String location,
            List<String> tags
    ) {
        this.title = title;
        this.content = content;
        this.noteDate = noteDate;
        this.location = location;
        this.tags = tags == null ? new ArrayList<>() : new ArrayList<>(tags);
    }

    // 나중에 내용을 암호문으로 바꾸고 true로 표시할 때 쓸 수 있음
    public void encryptContent(String encryptedContent) {
        this.content = encryptedContent;
        this.isEncrypted = true;
    }

    // 암호화된 내용을 다시 평문으로 바꾸고 싶을 때 사용할 수 있음. 나중에 확장용
    public void decryptContent(String plainContent) {
        this.content = plainContent;
        this.isEncrypted = false;
    }

    // 이 쪽지의 작성자인지 확인
    public boolean isAuthor(Long userId) {
        return author != null && author.getId().equals(userId);
    }
}