package shop.esjh.memoryjar.service;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import shop.esjh.memoryjar.entity.support.SupportInquiry;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.config.properties.SupportProperties;
import java.util.*;

/** 로그인한 본인에게 화면 재조회 신호만 보낸다. 쪽지 작성 여부·본문·초대코드·사진 주소는 보내지 않는다. */
@Service
@RequiredArgsConstructor
public class UserStateRealtimeService {
    private final SimpMessagingTemplate messages;
    private final JarMemberRepository members;
    private final SupportProperties supportProperties;

    /** 멤버 권한이 사라진 뒤에도 본인 채널로 종료 안내를 받을 수 있다. 수신자는 변경 트랜잭션 안에서 확정한다. */
    public void jarChanged(Long jarId, String type) {
        send(members.findActiveUserIds(jarId), new StateEvent(type, jarId, null));
    }

    /** 가입·역할 변경은 목록 갱신, 탈퇴·강퇴는 당사자의 화면 종료도 알린다. */
    public void membershipChanged(Long jarId, Long targetId, boolean revoked) {
        var activeIds = members.findActiveUserIds(jarId);
        send(activeIds, new StateEvent("JAR_LIST_CHANGED", jarId, null));
        if (revoked || !activeIds.contains(targetId)) {
            send(List.of(targetId), new StateEvent(revoked ? "JAR_ACCESS_REVOKED" : "JAR_LIST_CHANGED", jarId, null));
        }
    }

    public void jarCreated(Long jarId, Long ownerId) {
        send(List.of(ownerId), new StateEvent("JAR_LIST_CHANGED", jarId, null));
    }

    /** 삭제 전에 확보한 멤버 번호를 사용한다. 삭제된 Jar의 구독 권한을 다시 열어 주지 않는다. */
    public void jarDeleted(Long jarId, Collection<Long> previousMembers) {
        send(previousMembers, new StateEvent("JAR_ACCESS_REVOKED", jarId, null));
    }

    /** 초대코드 값은 보내지 않고 현재 관리 권한이 있는 사용자에게만 재조회를 요청한다. */
    public void invitesChanged(Long jarId) {
        send(members.findActiveManagerUserIds(jarId), new StateEvent("INVITES_CHANGED", jarId, null));
    }

    /** 게스트에게는 연결하지 않는다. 운영자와 로그인한 작성자에게만 번호를 전달하고 내용은 REST로 권한 재검사한다. */
    public void supportChanged(SupportInquiry inquiry) {
        Set<Long> ids = new HashSet<>();
        ids.addAll(supportProperties.getOperatorUserIds());
        if (inquiry.getOwnerId() != null) ids.add(inquiry.getOwnerId());
        send(ids, new StateEvent("SUPPORT_CHANGED", null, inquiry.getInquiryId()));
    }

    /** 커밋 실패 시 전송하지 않고, 전송 장애가 저장 성공을 실패 응답으로 바꾸지 않게 한다. */
    private void send(Collection<Long> ids, StateEvent event) {
        var recipients = ids.stream().filter(Objects::nonNull).filter(id -> id > 0).distinct().toList();
        if (recipients.isEmpty()) return;
        Runnable task = () -> recipients.forEach(id -> BestEffortDelivery.send("USER_STATE", () ->
                messages.convertAndSend("/topic/users/" + id + "/state", event)));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { task.run(); }
            });
        } else task.run();
    }

    /** 변경 종류와 재조회 대상만 담는다. 실제 내용과 권한은 포함하지 않는다. */
    public record StateEvent(String type, Long jarId, Long inquiryId) {}
}
