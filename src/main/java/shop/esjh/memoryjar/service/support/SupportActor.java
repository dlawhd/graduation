package shop.esjh.memoryjar.service.support;

import shop.esjh.memoryjar.entity.support.SupportInquiry;

/** 컨트롤러가 인증한 계정 또는 로그인 도움 전용 세션을 서비스에 전달한다. 요청 본문으로 권한을 받지 않는다. */
public record SupportActor(Long userId, Long guestSessionId, boolean operator) {
    public SupportActor {
        if ((userId == null) == (guestSessionId == null) || (operator && userId == null))
            throw new IllegalArgumentException("문의 접근 주체가 올바르지 않습니다.");
    }
    public static SupportActor user(Long id) { return new SupportActor(id, null, false); }
    public static SupportActor operator(Long id) { return new SupportActor(id, null, true); }
    public static SupportActor guest(Long id) { return new SupportActor(null, id, false); }
    public boolean owns(SupportInquiry i) {
        return userId != null ? userId.equals(i.getOwnerId()) : guestSessionId.equals(i.getGuestSessionId());
    }
    public String scope() { return userId != null ? "user:" + userId : "guest:" + guestSessionId; }
    public String role() { return operator ? "OPERATOR" : userId != null ? "USER" : "GUEST"; }
    public Long authorId() { return userId != null ? userId : guestSessionId; }
}
