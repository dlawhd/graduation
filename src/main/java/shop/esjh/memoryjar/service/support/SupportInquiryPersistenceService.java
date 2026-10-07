package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.data.domain.PageRequest;
import shop.esjh.memoryjar.dto.support.*;
import shop.esjh.memoryjar.dto.support.SupportInquiryResponse.InquiryPage;
import shop.esjh.memoryjar.entity.support.*;
import shop.esjh.memoryjar.enums.support.SupportInquiryStatus;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.repository.support.*;
import shop.esjh.memoryjar.repository.ai.*;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.service.notification.NotificationService;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/** 짧은 트랜잭션 안에서 문의를 예약/확정한다. 외부 파일 복사와 삭제는 이 클래스 밖에서 수행한다. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SupportInquiryPersistenceService {
    private final SupportInquiryRepository inquiries;
    private final SupportInquiryAuditRepository audits;
    private final JarDesignDraftRepository drafts;
    private final JarAiGenerationRepository generations;
    private final UserRepository users;
    private final SupportAuthorization authorization;
    private final NotificationService notifications;
    private static final List<SupportInquiryStatus> SUBMITTED = List.of(SupportInquiryStatus.OPEN,
            SupportInquiryStatus.IN_PROGRESS, SupportInquiryStatus.ANSWERED);

    public static LocalDateTime now() { return LocalDateTime.now(ZoneId.of("Asia/Seoul")); }

    /** 사용자 행과 Draft를 잠가 동시 중복 접수와 시간당 제한 우회를 막는다. 실패 정보는 DB에서만 읽는다. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public CopyTarget reserve(Long userId, SupportCreateRequest request) {
        if (!Boolean.TRUE.equals(request.shareOriginal())) throw problem(HttpStatus.BAD_REQUEST, "원본 이미지 공유 동의가 필요합니다.");
        LocalDateTime now = now();
        users.findByIdForUpdate(userId).orElseThrow(() -> problem(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
        var draft = drafts.findByDraftIdForUpdate(request.draftId()).orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "디자인을 찾을 수 없습니다."));
        if (!draft.isOwner(userId)) throw problem(HttpStatus.NOT_FOUND, "디자인을 찾을 수 없습니다.");
        var generation = generations.findByGenerationIdAndDraft_DraftId(request.generationId(), request.draftId())
                .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "후보를 찾을 수 없습니다."));
        if (generation.getStatus() != JarAiGenerationStatus.FAILED) throw problem(HttpStatus.CONFLICT, "실패한 후보만 문의할 수 있습니다.");
        var existing = inquiries.findByGenerationId(request.generationId()).orElse(null);
        if (existing != null && existing.isSubmitted()) return new CopyTarget(existing.getInquiryId(), null, null, true);
        if (existing != null && (existing.getStatus() == SupportInquiryStatus.COPYING || existing.getImageDeletedAt() == null))
            throw problem(HttpStatus.CONFLICT, "사진 보관 또는 정리가 진행 중입니다. 잠시 후 다시 확인해 주세요.");
        if (!draft.isActiveAndNotExpired(now) || draft.getOriginalS3DeletedAt() != null)
            throw problem(HttpStatus.GONE, "원본 보관 기간이 지나 새 문의를 접수할 수 없습니다.");
        if (inquiries.countByOwnerIdAndSharingAgreedAtAfter(userId, now.minusHours(1)) >= 10)
            throw problem(HttpStatus.TOO_MANY_REQUESTS, "문의는 한 시간에 10건까지 접수할 수 있습니다.");
        String key = "support-inquiries/" + userId + "/" + UUID.randomUUID() + ".png";
        SupportInquiry ticket;
        if (existing == null) {
            ticket = inquiries.saveAndFlush(SupportInquiry.reserve(userId, generation, request.description().strip(), key, now));
        } else {
            // FAILED 상태도 행 잠금 안에서 바꾼다. 정리 작업은 잠근 뒤 키가 같은지 다시 확인한다.
            ticket = inquiries.findForUpdate(existing.getInquiryId()).orElseThrow();
            ticket.restartCopy(request.description().strip(), draft.getOriginalS3Key(), key, now);
        }
        return new CopyTarget(ticket.getInquiryId(), draft.getOriginalS3Key(), key, false);
    }

    @Transactional
    public void completeCopy(Long userId, CopyTarget target) {
        var i = inquiries.findForUpdate(target.inquiryId()).orElseThrow();
        if (!i.getOwnerId().equals(userId) || i.getStatus() != SupportInquiryStatus.COPYING
                || !i.getImageS3Key().equals(target.imageKey()))
            throw problem(HttpStatus.CONFLICT, "접수 상태가 변경되어 사진 보관을 확정하지 못했습니다.");
        i.finishCopy(now());
        audits.save(new SupportInquiryAudit(i.getInquiryId(), userId, "CREATED", now()));
        // 원본 보관과 접수 확정이 성공할 때만 같은 트랜잭션에 알림을 저장한다.
        // 이미 접수된 후보는 completeCopy를 다시 호출하지 않으므로 중복 알림도 만들지 않는다.
        notifications.notifySupportInquiryReceived(authorization.operatorsToNotify(), i.getInquiryId());
    }

    @Transactional
    public void failCopy(CopyTarget target) {
        var i = inquiries.findForUpdate(target.inquiryId()).orElseThrow();
        if (i.getStatus() == SupportInquiryStatus.COPYING && i.getImageS3Key().equals(target.imageKey())) i.failCopy(now());
    }

    public SupportInquiryResponse detail(Long userId, Long id, boolean operator) {
        if (operator) authorization.requireOperator(userId);
        var i = ownedOrOperator(userId, id, operator);
        return SupportInquiryResponse.from(i, operator, now());
    }

    public List<SupportInquiryResponse> forDraft(Long userId, Long draftId) {
        if (!drafts.existsByDraftIdAndOwner_Id(draftId, userId)) throw problem(HttpStatus.NOT_FOUND, "디자인을 찾을 수 없습니다.");
        return inquiries.findByOwnerIdAndDraftIdOrderByInquiryIdDesc(userId, draftId, PageRequest.of(0, 200))
                .stream().map(i -> SupportInquiryResponse.from(i, false, now())).toList();
    }

    public InquiryPage list(Long userId, Long before, SupportInquiryStatus status, boolean operator) {
        if (operator) authorization.requireOperator(userId);
        long cursor = before == null ? Long.MAX_VALUE : before;
        if (cursor <= 0) throw problem(HttpStatus.BAD_REQUEST, "페이지 번호가 올바르지 않습니다.");
        if (operator && status != null && !SUBMITTED.contains(status)) throw problem(HttpStatus.BAD_REQUEST, "문의 상태를 확인해 주세요.");
        List<SupportInquiry> rows = operator
                ? inquiries.findByInquiryIdLessThanAndStatusInOrderByInquiryIdDesc(cursor,
                    status == null ? SUBMITTED : List.of(status), PageRequest.of(0, 13))
                : inquiries.findByOwnerIdAndInquiryIdLessThanOrderByInquiryIdDesc(userId, cursor, PageRequest.of(0, 13));
        var visible = rows.stream().limit(12).map(i -> SupportInquiryResponse.from(i, false, now())).toList();
        return new InquiryPage(visible, rows.size() > 12 ? visible.get(11).inquiryId() : null);
    }

    /** 운영자는 이미지를 명시적으로 열 때만 짧은 수명 URL을 받고 열람 이력이 남는다. */
    @Transactional
    public ImageTarget image(Long userId, Long id, boolean operator) {
        if (operator) authorization.requireOperator(userId);
        var i = ownedOrOperator(userId, id, operator);
        LocalDateTime now = now();
        if (!i.isSubmitted() || i.getImageDeletedAt() != null || !i.getImageExpiresAt().isAfter(now))
            throw problem(HttpStatus.GONE, "사진 보관 기간이 지났거나 아직 접수되지 않았습니다.");
        if (operator) audits.save(new SupportInquiryAudit(id, userId, "IMAGE_VIEWED", now));
        return new ImageTarget(i.getImageS3Key(), i.getImageExpiresAt());
    }

    @Transactional
    public SupportInquiryResponse review(Long operatorId, Long id) {
        authorization.requireOperator(operatorId);
        var i = inquiries.findForUpdate(id).orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "문의를 찾을 수 없습니다."));
        requireEditable(i);
        if (i.getStatus() == SupportInquiryStatus.OPEN) {
            i.startReview(now());
            audits.save(new SupportInquiryAudit(id, operatorId, "REVIEW_STARTED", now()));
        }
        return SupportInquiryResponse.from(i, true, now());
    }

    /** 답변과 알림을 같은 트랜잭션에 저장한다. 이미 답변한 문의는 다시 저장하거나 알리지 않는다. */
    @Transactional
    public SupportInquiryResponse reply(Long operatorId, Long id, String text) {
        authorization.requireOperator(operatorId);
        var i = inquiries.findForUpdate(id).orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "문의를 찾을 수 없습니다."));
        if (i.getStatus() == SupportInquiryStatus.ANSWERED) throw problem(HttpStatus.CONFLICT, "이미 답변한 문의입니다.");
        requireEditable(i);
        i.answer(text.strip(), now());
        audits.save(new SupportInquiryAudit(id, operatorId, "REPLIED", now()));
        notifications.notifySupportReplied(users.getReferenceById(i.getOwnerId()), id);
        return SupportInquiryResponse.from(i, true, now());
    }

    private void requireEditable(SupportInquiry i) {
        if (!i.isSubmitted() || !i.getContentExpiresAt().isAfter(now()))
            throw problem(HttpStatus.CONFLICT, "접수되지 않았거나 문의 보관 기간이 지났습니다.");
    }

    private SupportInquiry ownedOrOperator(Long userId, Long id, boolean operator) {
        var i = inquiries.findById(id).orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "문의를 찾을 수 없습니다."));
        if (!operator && !i.getOwnerId().equals(userId)) throw problem(HttpStatus.NOT_FOUND, "문의를 찾을 수 없습니다.");
        return i;
    }

    /** S3 삭제 후보는 다시 잠가 검사한다. 불명확한 복사는 SDK 제한 120초보다 긴 10분 뒤 정리한다. */
    @Transactional
    public ImageTarget prepareDelete(Long id) {
        var i = inquiries.findForUpdate(id).orElseThrow();
        LocalDateTime now = now();
        if (i.getImageDeletedAt() != null) return null;
        if (!i.isSubmitted() && !i.getUpdatedAt().isAfter(now.minusMinutes(10))) {
            if (i.getStatus() == SupportInquiryStatus.COPYING) i.failCopy(now);
            return new ImageTarget(i.getImageS3Key(), i.getImageExpiresAt());
        }
        return i.getImageExpiresAt().isAfter(now) ? null : new ImageTarget(i.getImageS3Key(), i.getImageExpiresAt());
    }

    @Transactional
    public void deleted(Long id, String key) {
        var i = inquiries.findForUpdate(id).orElseThrow();
        if (i.getImageS3Key().equals(key)) i.markImageDeleted(now());
    }

    @Transactional
    public void redact(Long id) {
        var i = inquiries.findForUpdate(id).orElseThrow();
        if (!i.getContentExpiresAt().isAfter(now())) i.redactContent(now());
    }

    @Transactional
    public void purgeAudits() { audits.deleteExpiredBatch(now().minusDays(90)); }

    private static ResponseStatusException problem(HttpStatus status, String message) { return new ResponseStatusException(status, message); }
    public record CopyTarget(Long inquiryId, String sourceKey, String imageKey, boolean alreadySubmitted) { }
    public record ImageTarget(String key, LocalDateTime expiresAt) { }
}
