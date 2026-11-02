package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.entity.support.SupportInquiry;
import shop.esjh.memoryjar.repository.support.SupportInquiryRepository;

/** 일반/운영/게스트 요청에 같은 소유권·보관 기한 검사를 적용한다. 호출자의 짧은 트랜잭션에 참여한다. */
@Service @RequiredArgsConstructor @Transactional(propagation = Propagation.MANDATORY)
public class SupportInquiryAccess {
    private final SupportInquiryRepository inquiries;
    private final SupportAuthorization authorization;
    public SupportInquiry require(SupportActor actor, Long id, boolean lock) {
        if (actor.operator()) authorization.requireOperator(actor.userId());
        var i = (lock ? inquiries.findForUpdate(id) : inquiries.findById(id))
                .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "문의를 찾을 수 없습니다."));
        if (!actor.operator() && !actor.owns(i)) throw problem(HttpStatus.NOT_FOUND, "문의를 찾을 수 없습니다.");
        return i;
    }
    public void activeContent(SupportInquiry i) {
        if (!i.isSubmitted() || i.getContentDeletedAt() != null || !i.getContentExpiresAt().isAfter(SupportInquiryPersistenceService.now()))
            throw problem(HttpStatus.GONE, "접수되지 않았거나 문의 보관 기간이 지났습니다.");
    }
    static ResponseStatusException problem(HttpStatus status, String message) { return new ResponseStatusException(status, message); }
}
