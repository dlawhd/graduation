package shop.esjh.memoryjar.entity.support;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/** 첨부 저장 전 목적 키를 먼저 기록한다. 저장 결과를 모르는 실패도 정리 작업이 추적할 수 있다. */
@Entity @Getter @NoArgsConstructor(access = AccessLevel.PROTECTED) @Table(name = "support_attachments")
public class SupportAttachment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long attachmentId;
    @Column(nullable=false) private Long inquiryId;
    @Column(nullable=false,length=36,columnDefinition="CHAR(36)") private String clientRequestId;
    private Long authorId;
    private Long guestSessionId;
    @Column(nullable=false,length=512,unique=true) private String storageKey;
    @Column(nullable=false,length=12) private String status;
    private Long byteSize;
    @Column(nullable=false) private LocalDateTime expiresAt;
    @Column(nullable=false) private LocalDateTime createdAt;
    private LocalDateTime deletedAt;
    public SupportAttachment(Long inquiryId,String requestId,Long authorId,Long guestId,String key,LocalDateTime expiry,LocalDateTime now) {
        this.inquiryId=inquiryId;clientRequestId=requestId;this.authorId=authorId;guestSessionId=guestId;
        storageKey=key;expiresAt=expiry;createdAt=now;status="UPLOADING";
    }
    public void ready(long bytes) { status="READY";byteSize=bytes; }
    public void fail() { if ("UPLOADING".equals(status)) status="FAILED"; }
    public void deleted(LocalDateTime now) { deletedAt=now; }
}
