package com.example.demo.entity.note;

import com.example.demo.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

// 쪽지에 붙은 첨부파일 정보"를 저장
// 실제 파일은 S3에 있고 DB에는 "어떤 쪽지에 붙었는지", "파일 주소가 뭔지", "순서가 몇 번째인지"
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(
        name = "note_attachments",
        uniqueConstraints = {

                // 같은 S3 key가 중복 저장되지 않도록 막아주는 제약조건
                @UniqueConstraint(
                        name = "uk_note_attachments_s3_key",
                        columnNames = "s3_key"
                ),

                // 같은 쪽지 안에서 같은 순서 번호가 중복되지 않도록 막아주는 제약조건
                // 예: note_id=3 에서 sort_order=0 이 2개 생기면 안 되니까 막아줌
                @UniqueConstraint(
                        name = "uk_note_attachments_note_sort_order",
                        columnNames = {"note_id", "sort_order"}
                )
        },
        indexes = {

                // 특정 쪽지의 첨부파일들을 찾을 때 빠르게 도와주는 인덱스
                @Index(
                        name = "idx_note_attachments_note_id",
                        columnList = "note_id"
                ),

                // 삭제되지 않은 첨부파일을 순서대로 조회할 때 도움이 되는 인덱스
                @Index(
                        name = "idx_note_attachments_note_id_deleted_at_sort_order",
                        columnList = "note_id, deleted_at, sort_order"
                ),

                // 파일 타입별 조회가 필요할 때 도움 될 수 있는 인덱스
                @Index(
                        name = "idx_note_attachments_content_type",
                        columnList = "content_type"
                )
        }
)
@SQLDelete(sql = "UPDATE note_attachments SET deleted_at = NOW(6) WHERE attachment_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class NoteAttachment extends BaseEntity {

    // 첨부파일 고유 번호
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "attachment_id")
    private Long id;

    // 어떤 쪽지에 속한 첨부파일인지 연결하는 값 , 첨부파일 여러 개가 하나의 Note에 붙을 수 있으니까 "N : 1" 관계
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "note_id", nullable = false)
    private Note note;

    // 화면에 보여줄 순서, 0 = 첫 번째, 1 = 두 번째
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    // S3 안에서 파일을 찾기 위한 내부 경로
    // 예: notes/10/2026/04/uuid-image.jpg
    @Column(name = "s3_key", nullable = false, length = 500)
    private String s3Key;

    // 실제 파일 접근 주소
    // 예: CloudFront URL, S3 조회 URL
    @Column(name = "url", nullable = false, length = 1000)
    private String url;

    // 썸네일 주소
    // 이미지/영상이면 있을 수 있고, 일반 파일은 없을 수도 있어서 nullable=true
    @Column(name = "thumbnail_url", length = 1000)
    private String thumbnailUrl;

    // 파일 종류
    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    // 파일 크기(byte)
    @Column(name = "size", nullable = false)
    private Long size;

    // 생성자 대신 Builder를 통해 안전하게 객체를 만들 수 있게 해줌
    @Builder
    public NoteAttachment(
            Note note,
            Integer sortOrder,
            String s3Key,
            String url,
            String thumbnailUrl,
            String contentType,
            Long size
    ) {
        this.note = note;
        this.sortOrder = sortOrder;
        this.s3Key = s3Key;
        this.url = url;
        this.thumbnailUrl = thumbnailUrl;
        this.contentType = contentType;
        this.size = size;
    }

    // 썸네일 주소를 나중에 업데이트할 때 사용하는 메서드
    // 예: 처음 업로드 직후에는 thumbnailUrl이 없고, 워커가 썸네일을 만든 뒤 나중에 이 메서드로 넣어줄 수 있음
    public void updateThumbnailUrl(String thumbnailUrl) {
        this.thumbnailUrl = thumbnailUrl;
    }

    // 첨부파일 순서를 바꾸고 싶을 때 사용하는 메서드
    public void updateSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }
}