package shop.esjh.memoryjar.entity.support;

import jakarta.persistence.*;
import lombok.NoArgsConstructor;
import lombok.AccessLevel;
import java.time.LocalDateTime;

/** 운영자의 사진 열람과 답변 이력만 기록한다. 문의 원문과 이미지 주소는 기록하지 않는다. */
@Entity
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "support_inquiry_audits")
public class SupportInquiryAudit {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long auditId;
    @Column(nullable = false) private Long inquiryId;
    @Column(nullable = false) private Long actorId;
    @Column(nullable = false, length = 30) private String action;
    @Column(nullable = false) private LocalDateTime createdAt;

    public SupportInquiryAudit(Long inquiryId, Long actorId, String action, LocalDateTime now) {
        this.inquiryId = inquiryId;
        this.actorId = actorId;
        this.action = action;
        createdAt = now;
    }
}
