package shop.esjh.memoryjar.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import shop.esjh.memoryjar.config.properties.SupportProperties;
import shop.esjh.memoryjar.entity.support.SupportInquiry;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 저장 확정 뒤 본인 채널로만 재조회 신호를 보내고 개인정보를 담지 않는지 검사한다. */
class UserStateRealtimeServiceTest {
    private final SimpMessagingTemplate messages = mock(SimpMessagingTemplate.class);
    private final JarMemberRepository members = mock(JarMemberRepository.class);
    private final SupportProperties properties = new SupportProperties();
    private final UserStateRealtimeService service = new UserStateRealtimeService(messages, members, properties);

    @AfterEach void clearTransaction() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test void commitIsRequiredAndRecipientsAreCapturedBeforeDeletion() {
        TransactionSynchronizationManager.initSynchronization();
        service.jarDeleted(7L, List.of(1L, 2L, 2L));
        verifyNoInteractions(messages);
        TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCommit());
        for (long id : List.of(1L, 2L)) {
            verify(messages).convertAndSend("/topic/users/" + id + "/state",
                    new UserStateRealtimeService.StateEvent("JAR_ACCESS_REVOKED", 7L, null));
        }
        verifyNoMoreInteractions(messages);
    }

    @Test void rollbackDoesNotPublish() {
        TransactionSynchronizationManager.initSynchronization();
        service.jarCreated(7L, 1L);
        TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCompletion(1));
        verifyNoInteractions(messages);
    }

    @Test void kickedMemberStillReceivesPersonalRevocation() {
        when(members.findActiveUserIds(7L)).thenReturn(List.of(1L));
        service.membershipChanged(7L, 2L, true);
        verify(messages).convertAndSend("/topic/users/2/state",
                new UserStateRealtimeService.StateEvent("JAR_ACCESS_REVOKED", 7L, null));
        verify(messages).convertAndSend("/topic/users/1/state",
                new UserStateRealtimeService.StateEvent("JAR_LIST_CHANGED", 7L, null));
        verifyNoMoreInteractions(messages);
    }

    @Test void inviteChangesOnlyGoToManagersAndDeliveryFailureIsIsolated() {
        when(members.findActiveManagerUserIds(7L)).thenReturn(List.of(1L, 2L));
        doThrow(new IllegalStateException("test delivery failure")).when(messages)
                .convertAndSend(eq("/topic/users/1/state"), any(Object.class));
        assertThatCode(() -> service.invitesChanged(7L)).doesNotThrowAnyException();
        verify(messages).convertAndSend("/topic/users/2/state",
                new UserStateRealtimeService.StateEvent("INVITES_CHANGED", 7L, null));
        verify(members).findActiveManagerUserIds(7L);
        verifyNoMoreInteractions(members);
    }

    @Test void supportOwnerAndOperatorsAreDeduplicatedAndGuestHasNoChannel() {
        properties.setOperatorUserIds(Set.of(1L, 3L));
        SupportInquiry inquiry = mock(SupportInquiry.class);
        when(inquiry.getInquiryId()).thenReturn(9L);
        when(inquiry.getOwnerId()).thenReturn(1L);
        service.supportChanged(inquiry);
        for (long id : List.of(1L, 3L)) {
            verify(messages).convertAndSend("/topic/users/" + id + "/state",
                    new UserStateRealtimeService.StateEvent("SUPPORT_CHANGED", null, 9L));
        }
        verifyNoMoreInteractions(messages);
        clearInvocations(messages);
        when(inquiry.getOwnerId()).thenReturn(null);
        service.supportChanged(inquiry);
        verify(messages, times(2)).convertAndSend(anyString(), any(Object.class));
        verifyNoMoreInteractions(messages);
    }
}
