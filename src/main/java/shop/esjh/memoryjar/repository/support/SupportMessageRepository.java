package shop.esjh.memoryjar.repository.support;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.Pageable;
import shop.esjh.memoryjar.entity.support.SupportMessage;
import java.util.*;

/** 대화는 문의 번호와 메시지 번호 인덱스로 필요한 페이지만 조회한다. */
public interface SupportMessageRepository extends JpaRepository<SupportMessage, Long> {
    Optional<SupportMessage> findByInquiryIdAndClientRequestId(Long inquiryId, String requestId);
    List<SupportMessage> findByInquiryIdAndMessageIdLessThanOrderByMessageIdDesc(Long inquiryId, Long before, Pageable page);
    long countByInquiryId(Long inquiryId);
    @Modifying @Query("update SupportMessage m set m.content='' where m.inquiryId=:id")
    int redactByInquiryId(@org.springframework.data.repository.query.Param("id") Long id);
}
