package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import shop.esjh.memoryjar.entity.support.SupportAttachment;
import shop.esjh.memoryjar.dto.support.SupportAttachmentResponse;
import shop.esjh.memoryjar.repository.support.*;
import java.util.*;
import java.time.Duration;
import java.time.LocalDateTime;
import static shop.esjh.memoryjar.service.support.SupportInquiryAccess.problem;

/** 첨부의 예약/확정/삭제 표시만 짧게 처리한다. 문의 → 첨부 순서를 유지하고 S3는 호출하지 않는다. */
@Service @RequiredArgsConstructor @Transactional(readOnly=true)
public class SupportAttachmentPersistenceService {
    private final SupportAttachmentRepository attachments;
    private final SupportInquiryRepository inquiries;
    private final SupportInquiryAccess access;
    private final SupportRateGuard rates;
    private final SupportInquiryAuditRepository audits;
    public List<SupportAttachmentResponse> list(SupportActor actor,Long inquiryId) {
        var i=access.require(actor,inquiryId,false); access.activeContent(i);
        var now=SupportInquiryPersistenceService.now();
        return attachments.visible(inquiryId,now,PageRequest.of(0,3))
                .stream().filter(a->a.getExpiresAt().isAfter(now)).map(SupportAttachmentResponse::from).toList();
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public UploadTarget reserve(SupportActor actor,Long inquiryId,String requestId) {
        var limit=rates.lock("support-upload:"+actor.scope());
        var i=access.require(actor,inquiryId,true); access.activeContent(i);
        if (i.getStatus()==shop.esjh.memoryjar.enums.support.SupportInquiryStatus.RESOLVED) throw problem(HttpStatus.CONFLICT,"문의를 다시 연 뒤 첨부해 주세요.");
        var existing=attachments.findByInquiryIdAndClientRequestId(inquiryId,requestId);
        if (existing.isPresent()) {
            var a=existing.get();
            if (!Objects.equals(a.getAuthorId(),actor.userId()) || !Objects.equals(a.getGuestSessionId(),actor.guestSessionId()))
                throw problem(HttpStatus.CONFLICT,"다른 요청의 첨부 번호입니다.");
            if ("READY".equals(a.getStatus()) && a.getDeletedAt()==null && a.getExpiresAt().isAfter(SupportInquiryPersistenceService.now())) return target(a,true);
            throw problem(HttpStatus.CONFLICT,"이미 처리 중이거나 실패한 첨부입니다. 새 첨부 요청으로 다시 시도해 주세요.");
        }
        if (attachments.activeCount(inquiryId,SupportInquiryPersistenceService.now())>=3)
            throw problem(HttpStatus.CONFLICT,"한 문의에는 화면 자료를 3개까지 첨부할 수 있습니다.");
        var now=SupportInquiryPersistenceService.now();
        if (!limit.consume(20,Duration.ofHours(1),now)) throw problem(HttpStatus.TOO_MANY_REQUESTS,"첨부 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
        var expiry=now.plusDays(30).isBefore(i.getContentExpiresAt())?now.plusDays(30):i.getContentExpiresAt();
        var a=attachments.saveAndFlush(new SupportAttachment(inquiryId,requestId,actor.userId(),actor.guestSessionId(),
                "support-attachments/"+inquiryId+"/"+UUID.randomUUID()+".png",expiry,now));
        return target(a,false);
    }
    @Transactional
    public SupportAttachmentResponse finish(SupportActor actor,UploadTarget target,long bytes) {
        access.activeContent(access.require(actor,target.inquiryId(),true));
        var a=attachments.lock(target.id()).orElseThrow();
        if (!a.getExpiresAt().isAfter(SupportInquiryPersistenceService.now())) throw problem(HttpStatus.GONE,"첨부 보관 기간이 지났습니다.");
        if (!Objects.equals(a.getStorageKey(),target.key()) || !"UPLOADING".equals(a.getStatus())) throw problem(HttpStatus.CONFLICT,"첨부 상태가 바뀌었습니다.");
        a.ready(bytes);
        audits.save(new shop.esjh.memoryjar.entity.support.SupportInquiryAudit(target.inquiryId(),actor.authorId(),actor.role()+"_ATTACHED",SupportInquiryPersistenceService.now()));
        return SupportAttachmentResponse.from(a);
    }
    /** 확정 결과가 유실됐어도 READY 사본은 보존하고 성공 결과를 복구한다. */
    @Transactional(propagation=Propagation.REQUIRES_NEW,isolation=Isolation.READ_COMMITTED)
    public SupportAttachmentResponse failedOrCommitted(SupportActor actor,UploadTarget target) {
        access.require(actor,target.inquiryId(),true);
        var a=attachments.lock(target.id()).orElseThrow();
        if (!Objects.equals(a.getStorageKey(),target.key())) return null;
        if ("READY".equals(a.getStatus())) return SupportAttachmentResponse.from(a);
        a.fail(); return null;
    }
    @Transactional
    public UploadTarget preview(SupportActor actor,Long inquiryId,Long id) {
        access.activeContent(access.require(actor,inquiryId,false));
        var a=attachments.findById(id).filter(x->x.getInquiryId().equals(inquiryId)).orElseThrow(()->problem(HttpStatus.NOT_FOUND,"첨부를 찾을 수 없습니다."));
        if (!"READY".equals(a.getStatus()) || a.getDeletedAt()!=null || !a.getExpiresAt().isAfter(SupportInquiryPersistenceService.now()))
            throw problem(HttpStatus.GONE,"첨부 보관 기간이 지났습니다.");
        if (actor.operator()) audits.save(new shop.esjh.memoryjar.entity.support.SupportInquiryAudit(inquiryId,actor.authorId(),"ATTACHMENT_VIEWED",SupportInquiryPersistenceService.now()));
        return target(a,true);
    }
    @Transactional
    public UploadTarget prepareDelete(Long id) {
        var reference=attachments.findById(id).orElse(null); if (reference==null) return null;
        inquiries.findForUpdate(reference.getInquiryId()).orElseThrow();
        var a=attachments.lock(id).orElseThrow(); var now=SupportInquiryPersistenceService.now();
        if (a.getDeletedAt()!=null || (a.getExpiresAt().isAfter(now) && ("READY".equals(a.getStatus()) || a.getCreatedAt().isAfter(now.minusMinutes(10))))) return null;
        a.fail(); return target(a,false);
    }
    @Transactional
    public void deleted(UploadTarget target) {
        inquiries.findForUpdate(target.inquiryId()).orElseThrow();
        var a=attachments.lock(target.id()).orElseThrow();
        if (Objects.equals(a.getStorageKey(),target.key())) a.deleted(SupportInquiryPersistenceService.now());
    }
    private UploadTarget target(SupportAttachment a,boolean ready) {
        return new UploadTarget(a.getAttachmentId(),a.getInquiryId(),a.getStorageKey(),a.getExpiresAt(),ready,SupportAttachmentResponse.from(a));
    }
    public record UploadTarget(Long id,Long inquiryId,String key,LocalDateTime expiresAt,boolean ready,SupportAttachmentResponse response) { }
}
