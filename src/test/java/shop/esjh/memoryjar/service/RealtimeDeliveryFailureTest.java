package shop.esjh.memoryjar.service;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import shop.esjh.memoryjar.dto.dailydraw.response.DailyDrawSocketEventResponse;
import shop.esjh.memoryjar.dto.jar.response.JarMemberSocketEventResponse;
import shop.esjh.memoryjar.dto.jar.response.JarOpenSocketEventResponse;
import shop.esjh.memoryjar.dto.note.response.NoteRealtimeEventResponse;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.repository.chat.ChatMessageRepository;
import shop.esjh.memoryjar.service.chat.ChatSystemMessageService;
import shop.esjh.memoryjar.service.jar.*;
import shop.esjh.memoryjar.service.note.NoteRealtimeService;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 각 실시간 서비스가 전송 실패를 격리하고, 커밋 전·롤백에는 메시지를 보내지 않는지 검사한다. */
class RealtimeDeliveryFailureTest {
    enum Channel { NOTE, MEMBER, DAILY_DRAW, OPEN, CHAT }

    private Runnable event(Channel channel, SimpMessagingTemplate messages) {
        return switch (channel) {
            case NOTE -> () -> new NoteRealtimeService(messages).sendNoteEventAfterCommit(1L, 2L, mock(NoteRealtimeEventResponse.class));
            case MEMBER -> () -> new JarMemberRealtimeService(messages,mock(UserStateRealtimeService.class)).sendMemberEventAfterCommit(1L, mock(JarMemberSocketEventResponse.class));
            case DAILY_DRAW -> () -> new JarDailyDrawRealtimeService(messages).sendDailyDrawEventAfterCommit(1L, mock(DailyDrawSocketEventResponse.class));
            case OPEN -> () -> new JarOpenRealtimeService(messages,mock(UserStateRealtimeService.class)).sendJarOpenedEventAfterCommit(1L, mock(JarOpenSocketEventResponse.class));
            case CHAT -> {
                var repository = mock(ChatMessageRepository.class);
                when(repository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
                var jar = mock(Jar.class); when(jar.getJarId()).thenReturn(1L);
                yield () -> new ChatSystemMessageService(repository, messages).createAndSendJarOpenedMessage(jar);
            }
        };
    }

    @ParameterizedTest @EnumSource(Channel.class)
    void committedDeliveryFailureNeverEscapesAndOtherDestinationsAreStillAttempted(Channel channel) {
        var messages = mock(SimpMessagingTemplate.class);
        doThrow(new MessageDeliveryException("fixture rejection")).when(messages).convertAndSend(anyString(), any(Object.class));
        TransactionSynchronizationManager.initSynchronization();
        try {
            event(channel, messages).run();
            verifyNoInteractions(messages);
            assertThatCode(() -> TransactionSynchronizationManager.getSynchronizations()
                    .forEach(TransactionSynchronization::afterCommit)).doesNotThrowAnyException();
            verify(messages, times(channel == Channel.NOTE ? 2 : 1)).convertAndSend(anyString(), any(Object.class));
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }

    @ParameterizedTest @EnumSource(Channel.class)
    void rollbackNeverDelivers(Channel channel) {
        var messages = mock(SimpMessagingTemplate.class);
        TransactionSynchronizationManager.initSynchronization();
        try {
            event(channel, messages).run();
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(callback -> callback.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
            verifyNoInteractions(messages);
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }

    @ParameterizedTest @EnumSource(Channel.class)
    void immediateDeliveryFailureNeverEscapes(Channel channel) {
        var messages = mock(SimpMessagingTemplate.class);
        doThrow(new MessageDeliveryException("fixture rejection")).when(messages).convertAndSend(anyString(), any(Object.class));
        assertThatCode(event(channel, messages)::run).doesNotThrowAnyException();
    }
}
