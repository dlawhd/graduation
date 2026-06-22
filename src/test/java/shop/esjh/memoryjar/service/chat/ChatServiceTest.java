package shop.esjh.memoryjar.service.chat;

import shop.esjh.memoryjar.dto.chat.request.ChatMessageSendRequest;
import shop.esjh.memoryjar.dto.chat.request.ChatReadRequest;
import shop.esjh.memoryjar.dto.chat.response.ChatMessageListResponse;
import shop.esjh.memoryjar.dto.chat.response.ChatMessageResponse;
import shop.esjh.memoryjar.dto.chat.response.ChatUnreadResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.chat.ChatMessage;
import shop.esjh.memoryjar.entity.chat.ChatReadState;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.chat.ChatMessageType;
import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarTheme;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.chat.ChatMessageRepository;
import shop.esjh.memoryjar.repository.chat.ChatReadStateRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    private static final Long USER_ID = 1L;
    private static final Long OTHER_USER_ID = 2L;
    private static final Long JAR_ID = 10L;

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 4, 24, 12, 0);

    @Mock
    private ChatMessageRepository chatMessageRepository;

    @Mock
    private ChatReadStateRepository chatReadStateRepository;

    @Mock
    private JarRepository jarRepository;

    @Mock
    private JarMemberRepository jarMemberRepository;

    @Mock
    private UserRepository userRepository;

    private ChatService chatService;

    private User currentUser;
    private User otherUser;
    private Jar jar;

    /*
     * 각 테스트 전에 공통으로 사용할 사용자, 저금통, Service를 준비한다.
     */
    @BeforeEach
    void setUp() {
        // 현재 로그인한 사용자
        currentUser = createUser(USER_ID, "은서");

        // 다른 사용자
        otherUser = createUser(OTHER_USER_ID, "친구");

        // 테스트용 저금통
        jar = createJar(JAR_ID, currentUser);

        // ChatService는 Spring이 아니라 테스트에서 직접 만들어 넣는다.
        chatService = new ChatService(
                chatMessageRepository,
                chatReadStateRepository,
                jarRepository,
                jarMemberRepository,
                userRepository
        );
    }

    @Test
    void sendTextMessage는_저금통_멤버이면_TEXT_채팅을_저장한다() {
        // given
        // 사용자가 일부러 앞뒤 공백을 넣은 상황
        ChatMessageSendRequest request = new ChatMessageSendRequest(" 안녕! ");

        // 현재 사용자 조회 성공
        when(userRepository.findById(USER_ID))
                .thenReturn(Optional.of(currentUser));

        // 저금통 조회 성공
        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        // 현재 사용자가 저금통 멤버라고 가정
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(true);

        // save가 호출되면 messageId와 createdAt을 넣어서 다시 돌려준다.
        when(chatMessageRepository.save(any(ChatMessage.class)))
                .thenAnswer(invocation -> {
                    ChatMessage message = invocation.getArgument(0);
                    setMessageIdAndTime(message, 100L);
                    return message;
                });

        // when
        ChatMessageResponse response = chatService.sendTextMessage(
                USER_ID,
                JAR_ID,
                request
        );

        // then
        // Repository에 실제 저장된 ChatMessage를 잡아서 확인한다.
        ArgumentCaptor<ChatMessage> captor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository).save(captor.capture());

        ChatMessage savedMessage = captor.getValue();

        // TEXT 메시지로 저장되어야 한다.
        assertThat(savedMessage.getType()).isEqualTo(ChatMessageType.TEXT);

        // 보낸 사람은 현재 사용자여야 한다.
        assertThat(savedMessage.getSender()).isEqualTo(currentUser);

        // 사용자가 입력한 공백은 잘리지 않고 그대로 저장되어야 한다.
        assertThat(savedMessage.getContent()).isEqualTo(" 안녕! ");

        // 응답값 확인
        assertThat(response.messageId()).isEqualTo(100L);
        assertThat(response.jarId()).isEqualTo(JAR_ID);
        assertThat(response.senderId()).isEqualTo(USER_ID);
        assertThat(response.senderName()).isEqualTo("은서");
        assertThat(response.type()).isEqualTo(ChatMessageType.TEXT);
        assertThat(response.content()).isEqualTo(" 안녕! ");
        assertThat(response.mine()).isTrue();
    }

    @Test
    void sendTextMessage는_저금통_멤버가_아니면_예외가_난다() {
        // given
        ChatMessageSendRequest request = new ChatMessageSendRequest("안녕!");

        when(userRepository.findById(USER_ID))
                .thenReturn(Optional.of(currentUser));

        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        // 현재 사용자가 저금통 멤버가 아니라고 가정
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(false);

        // when & then
        assertThatThrownBy(() -> chatService.sendTextMessage(USER_ID, JAR_ID, request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("현재 저금통 멤버만 채팅을 보낼 수 있어요.");

        // 멤버가 아니므로 메시지는 저장되면 안 된다.
        verify(chatMessageRepository, never()).save(any(ChatMessage.class));
    }

    @Test
    void sendTextMessage는_공백만_있는_메시지면_예외가_난다() {
        // given
        ChatMessageSendRequest request = new ChatMessageSendRequest("   ");

        when(userRepository.findById(USER_ID))
                .thenReturn(Optional.of(currentUser));

        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(true);

        // when & then
        assertThatThrownBy(() -> chatService.sendTextMessage(USER_ID, JAR_ID, request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("채팅 내용은 비어 있을 수 없어요.");

        verify(chatMessageRepository, never()).save(any(ChatMessage.class));
    }

    @Test
    void getMessages는_최신순으로_조회한_메시지를_오래된순으로_바꿔서_응답한다() {
        // given
        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(true);

        // Repository는 최신순 DESC로 가져온다고 가정
        // safeLimit=2이면 hasNext 확인을 위해 3개를 가져온다.
        ChatMessage message103 = createTextMessage(103L, currentUser, "세 번째");
        ChatMessage message102 = createTextMessage(102L, otherUser, "두 번째");
        ChatMessage message101 = createTextMessage(101L, currentUser, "첫 번째");

        when(chatMessageRepository.findMessagesBefore(
                eq(JAR_ID),
                isNull(),
                any(Pageable.class)
        )).thenReturn(List.of(message103, message102, message101));

        // when
        ChatMessageListResponse response = chatService.getMessages(
                USER_ID,
                JAR_ID,
                null,
                2
        );

        // then
        // 실제 응답에는 2개만 들어간다.
        assertThat(response.items()).hasSize(2);

        // Service가 오래된순 ASC로 바꿔서 내려줘야 한다.
        assertThat(response.items())
                .extracting(ChatMessageResponse::messageId)
                .containsExactly(102L, 103L);

        // 3개를 가져왔으므로 이전 메시지가 더 있다고 판단한다.
        assertThat(response.hasNext()).isTrue();

        // 다음 이전 조회는 가장 작은 messageId 기준으로 요청하면 된다.
        assertThat(response.nextBeforeMessageId()).isEqualTo(102L);
    }

    @Test
    void getNewMessages는_afterMessageId_이후_새_메시지를_응답한다() {
        // given
        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(true);

        ChatMessage message201 = createTextMessage(201L, otherUser, "새 메시지 1");
        ChatMessage message202 = createTextMessage(202L, currentUser, "새 메시지 2");

        when(chatMessageRepository.findMessagesAfter(
                eq(JAR_ID),
                eq(200L),
                any(Pageable.class)
        )).thenReturn(List.of(message201, message202));

        // when
        ChatMessageListResponse response = chatService.getNewMessages(
                USER_ID,
                JAR_ID,
                200L,
                30
        );

        // then
        assertThat(response.items()).hasSize(2);

        assertThat(response.items())
                .extracting(ChatMessageResponse::messageId)
                .containsExactly(201L, 202L);

        // 201번은 친구가 보낸 메시지라 mine=false
        assertThat(response.items().get(0).mine()).isFalse();

        // 202번은 내가 보낸 메시지라 mine=true
        assertThat(response.items().get(1).mine()).isTrue();

        // Polling 새 메시지 조회에서는 nextBeforeMessageId를 쓰지 않는다.
        assertThat(response.nextBeforeMessageId()).isNull();
    }

    @Test
    void markAsRead는_읽음상태가_없으면_새로_만들고_마지막_읽은_메시지를_저장한다() {
        // given
        ChatReadRequest request = new ChatReadRequest(300L);

        when(userRepository.findById(USER_ID))
                .thenReturn(Optional.of(currentUser));

        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(true);

        ChatMessage lastReadMessage = createTextMessage(300L, otherUser, "여기까지 읽음");

        // 읽음 처리하려는 메시지가 진짜 해당 저금통 메시지라고 가정
        when(chatMessageRepository.findByJar_JarIdAndMessageId(JAR_ID, 300L))
                .thenReturn(Optional.of(lastReadMessage));

        // 아직 읽음 상태가 없다고 가정
        when(chatReadStateRepository.findForUpdateByJarIdAndUserId(JAR_ID, USER_ID))
                .thenReturn(Optional.empty());

        // when
        chatService.markAsRead(USER_ID, JAR_ID, request);

        // then
        ArgumentCaptor<ChatReadState> captor = ArgumentCaptor.forClass(ChatReadState.class);
        verify(chatReadStateRepository).save(captor.capture());

        ChatReadState savedReadState = captor.getValue();

        assertThat(savedReadState.isJar(JAR_ID)).isTrue();
        assertThat(savedReadState.isUser(USER_ID)).isTrue();
        assertThat(savedReadState.getLastReadMessageId()).isEqualTo(300L);
    }

    @Test
    void markAsRead는_현재_저금통의_메시지가_아니면_예외가_난다() {
        // given
        ChatReadRequest request = new ChatReadRequest(999L);

        when(userRepository.findById(USER_ID))
                .thenReturn(Optional.of(currentUser));

        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(true);

        // 999번 메시지가 이 저금통에 없다고 가정
        when(chatMessageRepository.findByJar_JarIdAndMessageId(JAR_ID, 999L))
                .thenReturn(Optional.empty());

        // when & then
        assertThatThrownBy(() -> chatService.markAsRead(USER_ID, JAR_ID, request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("읽음 처리할 채팅 메시지를 찾을 수 없어요.");

        verify(chatReadStateRepository, never()).save(any(ChatReadState.class));
    }

    @Test
    void getUnreadCount는_마지막으로_읽은_메시지_이후의_unread_개수를_응답한다() {
        // given
        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(true);

        ChatMessage lastReadMessage = createTextMessage(400L, otherUser, "마지막으로 읽은 메시지");

        ChatReadState readState = ChatReadState.create(jar, currentUser);
        readState.markAsRead(lastReadMessage);

        when(chatReadStateRepository.findWithLastReadMessageByJarIdAndUserId(JAR_ID, USER_ID))
                .thenReturn(Optional.of(readState));

        when(chatMessageRepository.countUnreadMessages(JAR_ID, USER_ID, 400L))
                .thenReturn(3L);

        // when
        ChatUnreadResponse response = chatService.getUnreadCount(USER_ID, JAR_ID);

        // then
        assertThat(response.jarId()).isEqualTo(JAR_ID);
        assertThat(response.unreadCount()).isEqualTo(3L);
    }

    @Test
    void getUnreadCount는_읽음상태가_없으면_lastReadMessageId_null로_계산한다() {
        // given
        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(true);

        // 아직 읽음 상태가 없다고 가정
        when(chatReadStateRepository.findWithLastReadMessageByJarIdAndUserId(JAR_ID, USER_ID))
                .thenReturn(Optional.empty());

        when(chatMessageRepository.countUnreadMessages(JAR_ID, USER_ID, null))
                .thenReturn(5L);

        // when
        ChatUnreadResponse response = chatService.getUnreadCount(USER_ID, JAR_ID);

        // then
        assertThat(response.jarId()).isEqualTo(JAR_ID);
        assertThat(response.unreadCount()).isEqualTo(5L);
    }

    @Test
    void getMessages는_안읽은_메시지가_있으면_첫_안읽은_메시지부터_조회한다() {
        // given
        when(jarRepository.findByJarId(JAR_ID))
                .thenReturn(Optional.of(jar));

        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(JAR_ID, USER_ID))
                .thenReturn(true);

        ChatMessage lastReadMessage = createTextMessage(100L, otherUser, "마지막으로 읽은 메시지");

        ChatReadState readState = ChatReadState.create(jar, currentUser);
        readState.markAsRead(lastReadMessage);

        when(chatReadStateRepository.findWithLastReadMessageByJarIdAndUserId(JAR_ID, USER_ID))
                .thenReturn(Optional.of(readState));

        when(chatMessageRepository.findFirstUnreadMessageIds(
                eq(JAR_ID),
                eq(USER_ID),
                eq(100L),
                any(Pageable.class)
        )).thenReturn(List.of(101L));

        ChatMessage unread101 = createTextMessage(101L, otherUser, "첫 번째 안 읽은 메시지");
        ChatMessage unread102 = createTextMessage(102L, otherUser, "두 번째 안 읽은 메시지");

        when(chatMessageRepository.findMessagesFrom(
                eq(JAR_ID),
                eq(101L),
                any(Pageable.class)
        )).thenReturn(List.of(unread101, unread102));

        when(chatMessageRepository.existsByJar_JarIdAndMessageIdLessThan(JAR_ID, 101L))
                .thenReturn(true);

        // when
        ChatMessageListResponse response = chatService.getMessages(
                USER_ID,
                JAR_ID,
                null,
                30
        );

        // then
        assertThat(response.items())
                .extracting(ChatMessageResponse::messageId)
                .containsExactly(101L, 102L);

        assertThat(response.lastReadMessageId()).isEqualTo(100L);
        assertThat(response.firstUnreadMessageId()).isEqualTo(101L);
        assertThat(response.hasNext()).isTrue();
        assertThat(response.nextBeforeMessageId()).isEqualTo(101L);

        verify(chatMessageRepository, never()).findMessagesBefore(
                anyLong(),
                any(),
                any(Pageable.class)
        );
    }

    /*
     * 테스트용 User 생성 메서드
     *
     * User는 현재 builder를 제공하므로 builder로 만든다.
     */
    private User createUser(Long userId, String name) {
        return User.builder()
                .id(userId)
                .provider("NAVER")
                .providerId("naver-" + userId)
                .email(name + "@test.com")
                .name(name)
                .birthyear("2000")
                .build();
    }

    /*
     * 테스트용 Jar 생성 메서드
     *
     * Jar builder에는 jarId가 없으므로,
     * ReflectionTestUtils로 테스트에서만 jarId를 넣어준다.
     */
    private Jar createJar(Long jarId, User owner) {
        Jar jar = Jar.builder()
                .owner(owner)
                .name("테스트 저금통")
                .description("채팅 테스트용 저금통")
                .theme(JarTheme.SPRING)
                .maxMembers(2)
                .openAt(NOW.plusDays(10))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.TITLE_ONLY)
                .build();

        ReflectionTestUtils.setField(jar, "jarId", jarId);

        return jar;
    }

    /*
     * 테스트용 TEXT 채팅 메시지 생성 메서드
     *
     * ChatMessage.createText(...)로 실제 엔티티를 만들고,
     * DB가 넣어주는 messageId와 createdAt은 테스트에서 직접 넣어준다.
     */
    private ChatMessage createTextMessage(
            Long messageId,
            User sender,
            String content
    ) {
        ChatMessage message = ChatMessage.createText(jar, sender, content);
        setMessageIdAndTime(message, messageId);
        return message;
    }

    /*
     * messageId와 시간값을 테스트용으로 넣어주는 메서드
     *
     * 실제 DB에서는 JPA와 DB가 값을 넣어주지만,
     * 단위 테스트에서는 DB를 안 쓰기 때문에 직접 넣어준다.
     */
    private void setMessageIdAndTime(
            ChatMessage message,
            Long messageId
    ) {
        ReflectionTestUtils.setField(message, "messageId", messageId);
        ReflectionTestUtils.setField(message, "createdAt", NOW.plusSeconds(messageId));
        ReflectionTestUtils.setField(message, "updatedAt", NOW.plusSeconds(messageId));
    }
}