package shop.esjh.memoryjar.entity.support;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/** 문의별 대화를 한 행씩 저장한다. 요청 번호로 재전송을 구분하고 내용은 보관 기한 뒤 지운다. */
@Entity @Getter @NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name = "support_messages")
public class SupportMessage {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long messageId;
    @Column(nullable = false) private Long inquiryId;
    private Long authorId;
    @Column(nullable = false, length = 12) private String authorRole;
    @Column(nullable = false, length = 3000) private String content;
    @Column(length = 36, columnDefinition = "CHAR(36)") private String clientRequestId;
    @Column(nullable = false) private boolean waitingForUser;
    @Column(nullable = false) private LocalDateTime createdAt;

    public SupportMessage(Long inquiryId, Long authorId, String role, String content, String requestId, boolean waitingForUser, LocalDateTime now) {
        this.inquiryId = inquiryId; this.authorId = authorId; this.authorRole = role;
        this.content = content; this.clientRequestId = requestId; this.createdAt = now;
        this.waitingForUser = waitingForUser;
    }
}
