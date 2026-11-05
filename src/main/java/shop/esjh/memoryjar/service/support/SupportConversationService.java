package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.PageRequest;
import shop.esjh.memoryjar.dto.support.*;
import shop.esjh.memoryjar.entity.support.*;
import shop.esjh.memoryjar.enums.support.*;
import shop.esjh.memoryjar.repository.support.*;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.service.notification.NotificationService;
import java.time.Duration;
import java.util.*;
import static shop.esjh.memoryjar.service.support.SupportInquiryAccess.problem;

/** 일반 접수와 추가 대화·해결을 처리한다. 외부 I/O 없이 요청자 제한과 문의 잠금을 일관된 순서로 잡는다. */
@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class SupportConversationService {
    private final SupportInquiryRepository inquiries;
    private final SupportMessageRepository messages;
    private final SupportInquiryAuditRepository audits;
    private final SupportRateGuard rates;
    private final SupportInquiryAccess access;
    private final SupportAuthorization authorization;
    private final UserRepository users;
    private final JarDesignDraftRepository drafts;
    private final JarMemberRepository members;
    private final NotificationService notifications;
    private final SupportAccessCrypto crypto;
    private final SupportAttachmentRepository attachments;
    private final shop.esjh.memoryjar.service.UserStateRealtimeService userState;

    /** 재전송은 기존 접수를 반환한다. 같은 접수자의 생성 제한/중복 검사를 DB에서 직렬화한다. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public SupportInquiryResponse create(SupportActor actor, SupportGeneralCreateRequest request) {
        if (actor.operator()) throw problem(HttpStatus.BAD_REQUEST, "본인 문의 화면에서 접수해 주세요.");
        rates.lock("support-create:" + actor.scope());
        String requestId = request.requestId().toLowerCase(Locale.ROOT);
        String fingerprint = fingerprint(request);
        var existing = actor.userId() != null ? inquiries.findByOwnerIdAndClientRequestId(actor.userId(), requestId)
                : inquiries.findByGuestSessionIdAndClientRequestId(actor.guestSessionId(), requestId);
        if (existing.isPresent()) {
            var old = existing.get();
            if (!Objects.equals(old.getRequestFingerprint(), fingerprint))
                throw problem(HttpStatus.CONFLICT, "같은 요청 번호의 내용이 다릅니다. 새 문의로 접수해 주세요.");
            return SupportInquiryResponse.from(old, false, SupportInquiryPersistenceService.now());
        }
        var now = SupportInquiryPersistenceService.now();
        var occurredAt=request.occurredAt()==null?null:request.occurredAt().atZoneSameInstant(java.time.ZoneId.of("Asia/Seoul")).toLocalDateTime();
        if (occurredAt!=null && (occurredAt.isBefore(now.minusDays(90)) || occurredAt.isAfter(now.plusDays(1))))
            throw problem(HttpStatus.BAD_REQUEST,"발생 시각을 확인해 주세요. 최근 90일 이내의 상황만 연결할 수 있습니다.");
        long recent = actor.userId() != null ? inquiries.countByOwnerIdAndSharingAgreedAtAfter(actor.userId(), now.minusHours(1))
                : inquiries.countByGuestSessionIdAndCreatedAtAfter(actor.guestSessionId(), now.minusHours(1));
        if (recent >= (actor.userId() != null ? 10 : 5)) throw problem(HttpStatus.TOO_MANY_REQUESTS, "한 시간 동안 접수 가능한 문의 수를 초과했습니다.");
        String path;
        if (actor.guestSessionId() != null) {
            if (request.category() != SupportCategory.LOGIN_ACCOUNT || request.jarId() != null || request.draftId() != null)
                throw problem(HttpStatus.BAD_REQUEST, "로그인 도움에서는 로그인 문제만 접수할 수 있습니다.");
            path = "/support/login-help";
        } else {
            if (!users.existsById(actor.userId())) throw problem(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
            if (request.jarId() != null && !members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(request.jarId(), actor.userId()))
                throw problem(HttpStatus.NOT_FOUND, "연결할 저금통을 찾을 수 없습니다.");
            if (request.draftId() != null && !drafts.existsByDraftIdAndOwner_Id(request.draftId(), actor.userId()))
                throw problem(HttpStatus.NOT_FOUND, "연결할 디자인을 찾을 수 없습니다.");
            path = request.jarId() != null ? "/jars/" + request.jarId() : request.draftId() != null ? "/jars/design/new" : safePath(request.contextPath());
        }
        var ticket = inquiries.saveAndFlush(SupportInquiry.openGeneral(actor.userId(), actor.guestSessionId(), request.category(),
                request.title().strip(), request.description().strip(), requestId, fingerprint, request.jarId(), request.draftId(), path,
                request.errorCode(), occurredAt, now));
        audits.save(new SupportInquiryAudit(ticket.getInquiryId(), actor.authorId(), actor.role() + "_CREATED", now));
        notifications.notifySupportInquiryReceived(authorization.operatorsToNotify(), ticket.getInquiryId());
        userState.supportChanged(ticket);
        return SupportInquiryResponse.from(ticket, false, now);
    }
    public SupportInquiryResponse detail(SupportActor actor, Long id) {
        return SupportInquiryResponse.from(access.require(actor,id,false), actor.operator(), SupportInquiryPersistenceService.now());
    }
    /** 최초 상세는 한 HTTP 요청과 고정 개수 조회로 구성한다. 대화를 전부 읽거나 첨부마다 조회하지 않는다. */
    public SupportDetailResponse view(SupportActor actor,Long id) {
        var i=access.require(actor,id,false);var now=SupportInquiryPersistenceService.now();
        var response=SupportInquiryResponse.from(i,actor.operator(),now);
        if (!i.isSubmitted() || response.contentExpired()) return new SupportDetailResponse(response,new SupportMessageResponse.MessagePage(List.of(),null),List.of());
        var rows=messages.findByInquiryIdAndMessageIdLessThanOrderByMessageIdDesc(id,Long.MAX_VALUE,PageRequest.of(0,21));
        var items=rows.stream().limit(20).map(SupportMessageResponse::from).toList();
        return new SupportDetailResponse(response,new SupportMessageResponse.MessagePage(items,rows.size()>20?items.get(19).messageId():null),
                attachments.visible(id,now,PageRequest.of(0,3)).stream().map(SupportAttachmentResponse::from).toList());
    }
    public SupportInquiryResponse.InquiryPage guestList(SupportActor actor, Long before) {
        if (actor.guestSessionId() == null) throw problem(HttpStatus.FORBIDDEN, "로그인 도움 문의만 조회할 수 있습니다.");
        var rows = inquiries.findByGuestSessionIdAndInquiryIdLessThanOrderByInquiryIdDesc(actor.guestSessionId(), cursor(before), PageRequest.of(0,13));
        var items = rows.stream().limit(12).map(i -> SupportInquiryResponse.from(i,false,SupportInquiryPersistenceService.now())).toList();
        return new SupportInquiryResponse.InquiryPage(items, rows.size()>12 ? items.get(11).inquiryId() : null);
    }
    public SupportMessageResponse.MessagePage messages(SupportActor actor, Long id, Long before) {
        var i = access.require(actor,id,false); access.activeContent(i);
        var rows = messages.findByInquiryIdAndMessageIdLessThanOrderByMessageIdDesc(id,cursor(before),PageRequest.of(0,21));
        var items = rows.stream().limit(20).map(SupportMessageResponse::from).toList();
        return new SupportMessageResponse.MessagePage(items,rows.size()>20 ? items.get(19).messageId() : null);
    }
    /** 제한 키 → 문의 잠금 순서다. 사용자 행을 추가로 잠그지 않아 알림 수신자 검사와 교차하지 않는다. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public SupportMessageResponse append(SupportActor actor, Long id, SupportMessageRequest request) {
        var limit = rates.lock("support-message:" + actor.scope());
        var i = access.require(actor,id,true); access.activeContent(i);
        if (request.waitingForUser() && !actor.operator()) throw problem(HttpStatus.BAD_REQUEST, "운영자만 추가 정보를 요청할 수 있습니다.");
        String requestId = request.requestId().toLowerCase(Locale.ROOT), content = request.content().strip();
        var old = messages.findByInquiryIdAndClientRequestId(id,requestId);
        if (old.isPresent()) {
            var m = old.get();
            if (!actor.role().equals(m.getAuthorRole()) || !Objects.equals(actor.authorId(),m.getAuthorId()) || !content.equals(m.getContent())
                    || request.waitingForUser() != m.isWaitingForUser()) throw problem(HttpStatus.CONFLICT,"같은 요청 번호의 내용이 다릅니다.");
            return SupportMessageResponse.from(m);
        }
        if (i.getStatus()==SupportInquiryStatus.RESOLVED) throw problem(HttpStatus.CONFLICT,"문의를 다시 연 뒤 내용을 추가해 주세요.");
        // 운영자는 여러 문의에 답하므로 개인 문의자와 한도를 나눈다. 보호 장치는 유지하되 300건 대응을 막지 않는다.
        int hourlyLimit=actor.operator()?1000:50;
        if (!limit.consume(hourlyLimit,Duration.ofHours(1),SupportInquiryPersistenceService.now()))
            throw problem(HttpStatus.TOO_MANY_REQUESTS,"추가 대화 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
        if (messages.countByInquiryId(id)>=100) throw problem(HttpStatus.CONFLICT,"대화가 100개에 도달했습니다. 새 문의를 접수해 주세요.");
        var now=SupportInquiryPersistenceService.now();
        var message=messages.save(new SupportMessage(id,actor.authorId(),actor.role(),content,requestId,request.waitingForUser(),now));
        i.messageAdded(actor.operator(),request.waitingForUser(),content,now);
        audits.save(new SupportInquiryAudit(id,actor.authorId(),actor.role()+"_MESSAGE",now));
        if (actor.operator() && i.getOwnerId()!=null) notifications.notifySupportReplied(users.getReferenceById(i.getOwnerId()),id);
        if (!actor.operator()) notifications.notifySupportFollowedUp(authorization.operatorsToNotify(),id);
        userState.supportChanged(i);
        return SupportMessageResponse.from(message);
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public SupportInquiryResponse resolve(SupportActor actor,Long id,boolean resolved) {
        var i=access.require(actor,id,true); access.activeContent(i);
        if ((i.getStatus()==SupportInquiryStatus.RESOLVED)==resolved) return SupportInquiryResponse.from(i,actor.operator(),SupportInquiryPersistenceService.now());
        var now=SupportInquiryPersistenceService.now(); i.resolve(resolved,now);
        audits.save(new SupportInquiryAudit(id,actor.authorId(),resolved?"RESOLVED":"REOPENED",now));
        if (!resolved && !actor.operator()) notifications.notifySupportFollowedUp(authorization.operatorsToNotify(),id);
        userState.supportChanged(i);
        return SupportInquiryResponse.from(i,actor.operator(),now);
    }
    private long cursor(Long before) { if (before!=null && before<=0) throw problem(HttpStatus.BAD_REQUEST,"조회 번호가 올바르지 않습니다."); return before==null?Long.MAX_VALUE:before; }
    /** 본문에 구분 문자가 있어도 혼동하지 않도록 각 값을 Base64로 묶어 요청 전체의 지문을 만든다. */
    private String fingerprint(SupportGeneralCreateRequest r) {
        Object[] values={r.category(),r.title().strip(),r.description().strip(),r.jarId(),r.draftId(),safePath(r.contextPath()),r.errorCode(),r.occurredAt()==null?null:r.occurredAt().toInstant()};
        String encoded=Arrays.stream(values).map(v->v==null?"~":Base64.getEncoder().encodeToString(v.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                .collect(java.util.stream.Collectors.joining("|"));
        return crypto.hash(encoded);
    }
    private String safePath(String path) {
        return path!=null && Set.of("/","/jars","/jars/new","/jars/design/new","/help","/signup","/find-id","/find-password").contains(path) ? path : null;
    }
}
