package shop.esjh.memoryjar.repository.support;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;
import shop.esjh.memoryjar.entity.support.SupportInquiry;
import shop.esjh.memoryjar.enums.support.SupportInquiryStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/** 문의 목록은 제한된 페이지로 읽고, 접수/답변/정리의 상태 전이는 같은 행 잠금을 사용한다. */
public interface SupportInquiryRepository extends JpaRepository<SupportInquiry, Long> {
    Optional<SupportInquiry> findByGenerationId(Long generationId);
    List<SupportInquiry> findByOwnerIdAndDraftIdOrderByInquiryIdDesc(Long ownerId, Long draftId, Pageable page);
    List<SupportInquiry> findByOwnerIdAndInquiryIdLessThanOrderByInquiryIdDesc(Long ownerId, Long before, Pageable page);
    List<SupportInquiry> findByInquiryIdLessThanAndStatusInOrderByInquiryIdDesc(Long before, List<SupportInquiryStatus> statuses, Pageable page);
    long countByOwnerIdAndSharingAgreedAtAfter(Long ownerId, LocalDateTime since);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from SupportInquiry i where i.inquiryId = :id")
    Optional<SupportInquiry> findForUpdate(@Param("id") Long id);

    @Query("select i.inquiryId from SupportInquiry i where i.imageDeletedAt is null and "
            + "(i.imageExpiresAt <= :now or (i.status in (shop.esjh.memoryjar.enums.support.SupportInquiryStatus.COPY_FAILED, "
            + "shop.esjh.memoryjar.enums.support.SupportInquiryStatus.COPYING) and i.updatedAt <= :cutoff)) order by i.inquiryId")
    List<Long> findImageCleanupIds(@Param("now") LocalDateTime now, @Param("cutoff") LocalDateTime cutoff, Pageable page);
    @Query("select i.inquiryId from SupportInquiry i where i.contentDeletedAt is null and i.contentExpiresAt <= :now order by i.inquiryId")
    List<Long> findContentCleanupIds(@Param("now") LocalDateTime now, Pageable page);
}
