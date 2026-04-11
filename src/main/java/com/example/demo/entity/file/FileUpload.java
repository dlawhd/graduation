package com.example.demo.entity.file;

import com.example.demo.entity.BaseEntity;
import com.example.demo.entity.User;
import com.example.demo.enums.file.FilePurpose;
import com.example.demo.enums.file.FileUploadStatus;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDateTime;

// 파일 업로드 진행 상태를 저장
// 실제 파일은 S3에 있고, DB에는 "누가", "무슨 용도로", "어떤 s3Key로", "완료됐는지"만 기록
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "file_uploads")
@SQLDelete(sql = "UPDATE file_uploads SET deleted_at = NOW(6) WHERE upload_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FileUpload extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "upload_id")
    private Long id;

    // 이 파일을 발급받은 사용자
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // NOTE / PROFILE / JAR 같은 파일 목적
    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", nullable = false, length = 30)
    private FilePurpose purpose;

    // PRESIGNED / COMPLETED / CONSUMED
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private FileUploadStatus status;

    // S3 안의 실제 경로
    @Column(name = "s3_key", nullable = false, unique = true, length = 500)
    private String s3Key;

    // 브라우저가 접근할 공개 URL
    @Column(name = "public_url", nullable = false, length = 1000)
    private String publicUrl;

    // 이미지/png, 영상/mp4 같은 타입
    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    // 파일 크기
    @Column(name = "size", nullable = false)
    private Long size;

    // complete 성공 시각
    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    // note에 연결해서 "이미 사용 완료" 처리한 시각
    @Column(name = "consumed_at")
    private LocalDateTime consumedAt;

    @Builder
    public FileUpload(
            User user,
            FilePurpose purpose,
            FileUploadStatus status,
            String s3Key,
            String publicUrl,
            String contentType,
            Long size
    ) {
        this.user = user;
        this.purpose = purpose;
        this.status = status;
        this.s3Key = s3Key;
        this.publicUrl = publicUrl;
        this.contentType = contentType;
        this.size = size;
    }

    // 업로드 완료로 바꿀 때 쓰는 메서드
    public void markCompleted() {
        this.status = FileUploadStatus.COMPLETED;
        this.completedAt = LocalDateTime.now();
    }

    // note 등에 연결해서 다시 못 쓰게 막을 때 쓰는 메서드
    public void markConsumed() {
        this.status = FileUploadStatus.CONSUMED;
        this.consumedAt = LocalDateTime.now();
    }
}