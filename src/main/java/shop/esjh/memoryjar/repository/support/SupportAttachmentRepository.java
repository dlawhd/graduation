package shop.esjh.memoryjar.repository.support;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;
import shop.esjh.memoryjar.entity.support.SupportAttachment;
import java.time.LocalDateTime;
import java.util.*;

/** 첨부 목록/정리 후보는 제한된 건수만 조회하고 상태 변경은 문의 잠금 뒤에 수행한다. */
public interface SupportAttachmentRepository extends JpaRepository<SupportAttachment,Long> {
    Optional<SupportAttachment> findByInquiryIdAndClientRequestId(Long inquiryId,String requestId);
    List<SupportAttachment> findByInquiryIdAndStatusAndDeletedAtIsNullOrderByAttachmentIdAsc(Long inquiryId,String status,Pageable page);
    long countByInquiryIdAndStatusInAndDeletedAtIsNull(Long inquiryId,List<String> states);
    @Query("select a from SupportAttachment a where a.inquiryId=:id and a.status='READY' and a.deletedAt is null and a.expiresAt>:now order by a.attachmentId")
    List<SupportAttachment> visible(@Param("id") Long id,@Param("now") LocalDateTime now,Pageable page);
    @Query("select count(a) from SupportAttachment a where a.inquiryId=:id and a.status in ('UPLOADING','READY') and a.deletedAt is null and a.expiresAt>:now")
    long activeCount(@Param("id") Long id,@Param("now") LocalDateTime now);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select a from SupportAttachment a where a.attachmentId=:id")
    Optional<SupportAttachment> lock(@Param("id") Long id);
    @Query("select a.attachmentId from SupportAttachment a where a.deletedAt is null and (a.expiresAt<=:now or (a.status<>'READY' and a.createdAt<=:cutoff)) order by a.attachmentId")
    List<Long> cleanupIds(@Param("now") LocalDateTime now,@Param("cutoff") LocalDateTime cutoff,Pageable page);
}
