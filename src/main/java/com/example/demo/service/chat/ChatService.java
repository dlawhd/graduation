package com.example.demo.service.chat;

import com.example.demo.dto.chat.request.ChatMessageSendRequest;
import com.example.demo.dto.chat.request.ChatReadRequest;
import com.example.demo.dto.chat.response.ChatMessageListResponse;
import com.example.demo.dto.chat.response.ChatMessageResponse;
import com.example.demo.dto.chat.response.ChatSocketMessageResponse;
import com.example.demo.dto.chat.response.ChatUnreadResponse;
import com.example.demo.dto.redis.RedisChatMessageEvent;
import com.example.demo.entity.User;
import com.example.demo.entity.chat.ChatMessage;
import com.example.demo.entity.chat.ChatReadState;
import com.example.demo.entity.jar.Jar;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.chat.ChatMessageRepository;
import com.example.demo.repository.chat.ChatReadStateRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.service.redis.RedisChatPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class ChatService {

    // 채팅 메시지 기본 조회 개수
    private static final int DEFAULT_LIMIT = 30;

    // 채팅 메시지 최대 조회 개수
    // 너무 많이 가져오면 서버와 DB가 힘들어질 수 있어서 제한한다.
    private static final int MAX_LIMIT = 100;

    private final ChatMessageRepository chatMessageRepository;
    private final ChatReadStateRepository chatReadStateRepository;
    private final JarRepository jarRepository;
    private final JarMemberRepository jarMemberRepository;
    private final UserRepository userRepository;
    private final RedisChatPublisher redisChatPublisher;

    public ChatService(
            ChatMessageRepository chatMessageRepository,
            ChatReadStateRepository chatReadStateRepository,
            JarRepository jarRepository,
            JarMemberRepository jarMemberRepository,
            UserRepository userRepository,
            RedisChatPublisher redisChatPublisher
    ) {
        this.chatMessageRepository = chatMessageRepository;
        this.chatReadStateRepository = chatReadStateRepository;
        this.jarRepository = jarRepository;
        this.jarMemberRepository = jarMemberRepository;
        this.userRepository = userRepository;
        this.redisChatPublisher = redisChatPublisher;
    }

    // 채팅 메시지 보내기
    // 사용 상황: POST /api/v1/jars/{jarId}/chat/messages
    @Transactional
    public ChatMessageResponse sendTextMessage(
            Long currentUserId,
            Long jarId,
            ChatMessageSendRequest request
    ) {

        // 1. 현재 로그인한 사용자 찾기
        User currentUser = getUserOrThrow(currentUserId);

        // 2. 채팅을 보낼 저금통 찾기
        Jar jar = getJarOrThrow(jarId);

        // 3. 현재 사용자가 이 저금통의 active 멤버인지 확인
        validateActiveMember(
                jarId,
                currentUserId,
                "현재 저금통 멤버만 채팅을 보낼 수 있어요."
        );

        // 4. 채팅 내용 꺼내기
        String content = request.content();

        // 5. 빈 채팅 방지
        // @Valid에서도 막지만, Service 테스트나 내부 호출을 위해 한 번 더 안전하게 검사한다.
        if (content == null || content.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "채팅 내용은 비어 있을 수 없어요."
            );
        }

        // 6. TEXT 채팅 메시지 엔티티 생성
        ChatMessage message = ChatMessage.createText(jar, currentUser, content);

        // 7. DB에 저장
        ChatMessage savedMessage = chatMessageRepository.save(message);

        // 8. 화면에 내려줄 응답 DTO로 변환
        return toChatMessageResponse(savedMessage, currentUserId);
    }

    /*
     * WebSocket 채팅 메시지 보내기
     *
     * 사용 상황:
     * /app/jars/{jarId}/chat.send
     *
     * 쉽게 말하면:
     * - WebSocket으로 들어온 채팅을 DB에 저장하고
     * - Redis 방송국에 "새 채팅 왔어!"라고 발행한다.
     *
     * 주의:
     * - 여기서는 직접 WebSocket으로 뿌리지 않는다.
     * - RedisChatSubscriber가 Redis 메시지를 받아서 WebSocket으로 뿌린다.
     */
    @Transactional
    public ChatSocketMessageResponse sendSocketMessage(
            Long currentUserId,
            Long jarId,
            ChatMessageSendRequest request
    ) {
        // 1. 기존 REST 채팅 저장 로직 재사용
        ChatMessageResponse savedMessage = sendTextMessage(
                currentUserId,
                jarId,
                request
        );

        // 2. WebSocket 전송용 DTO로 변환
        ChatSocketMessageResponse socketMessage =
                ChatSocketMessageResponse.from(savedMessage);

        // 3. Redis로 보낼 이벤트 생성
        RedisChatMessageEvent event = new RedisChatMessageEvent(
                socketMessage.messageId(),
                socketMessage.jarId(),
                socketMessage.senderId(),
                socketMessage.senderName(),
                socketMessage.type(),
                socketMessage.content(),
                socketMessage.createdAt()
        );

        // 4. Redis 채널로 발행
        redisChatPublisher.publish(event);

        // 5. 테스트나 추후 확장을 위해 저장된 메시지 반환
        return socketMessage;
    }

    /*
     * 채팅 메시지 목록 조회
     *
     * 사용 상황:
     * GET /api/v1/jars/{jarId}/chat/messages?beforeMessageId=100&limit=30
     *
     * beforeMessageId가 null이면:
     * - 최신 메시지부터 limit개 가져온다.
     *
     * beforeMessageId가 있으면:
     * - 그 메시지보다 오래된 메시지를 가져온다.
     *
     * 중요한 점:
     * - Repository에서는 최신순(DESC)으로 가져온다.
     * - 프론트 채팅창에는 오래된순(ASC)이 보기 좋다.
     * - 그래서 Service에서 오래된순으로 정렬해서 내려준다.
     */
    public ChatMessageListResponse getMessages(
            Long currentUserId,
            Long jarId,
            Long beforeMessageId,
            Integer limit
    ) {

        // 1. 저금통 존재 확인
        getJarOrThrow(jarId);

        // 2. 현재 사용자가 active 멤버인지 확인
        validateActiveMember(
                jarId,
                currentUserId,
                "현재 저금통 멤버만 채팅을 볼 수 있어요."
        );

        // 3. limit 정리
        int safeLimit = normalizeLimit(limit);

        // 4. hasNext 계산을 위해 limit + 1개 조회
        // 예: 30개 요청이면 31개를 가져와 보고,
        // 31개가 있으면 "이전 메시지가 더 있다"고 판단한다.
        List<ChatMessage> fetchedMessages = chatMessageRepository.findMessagesBefore(
                jarId,
                beforeMessageId,
                PageRequest.of(0, safeLimit + 1)
        );

        // 5. 이전 메시지가 더 있는지 확인
        boolean hasNext = fetchedMessages.size() > safeLimit;

        // 6. 실제 응답에는 safeLimit개까지만 담는다.
        List<ChatMessage> limitedMessages = fetchedMessages.stream()
                .limit(safeLimit)
                .toList();

        // 7. 채팅창에 보여주기 좋게 오래된순으로 정렬한다.
        List<ChatMessage> orderedMessages = limitedMessages.stream()
                .sorted(Comparator.comparing(ChatMessage::getMessageId))
                .toList();

        // 8. Entity 목록을 Response DTO 목록으로 변환한다.
        List<ChatMessageResponse> items = orderedMessages.stream()
                .map(message -> toChatMessageResponse(message, currentUserId))
                .toList();

        // 9. 다음 이전 메시지 조회에 쓸 커서 계산
        // 가장 작은 messageId를 beforeMessageId로 보내면 그보다 오래된 메시지를 가져올 수 있다.
        Long nextBeforeMessageId = orderedMessages.isEmpty()
                ? null
                : orderedMessages.get(0).getMessageId();

        // 10. 목록 응답 반환
        return ChatMessageListResponse.of(items, hasNext, nextBeforeMessageId);
    }

    /*
     * Polling용 새 메시지 조회
     *
     * 사용 상황:
     * GET /api/v1/jars/{jarId}/chat/messages/new?afterMessageId=100&limit=30
     *
     * afterMessageId가 100이면:
     * - 101번 이후 메시지만 가져온다.
     *
     * 프론트에서는 보통 2~5초마다 이 API를 호출해서
     * 새 메시지가 있으면 화면에 붙인다.
     */
    public ChatMessageListResponse getNewMessages(
            Long currentUserId,
            Long jarId,
            Long afterMessageId,
            Integer limit
    ) {

        // 1. 저금통 존재 확인
        getJarOrThrow(jarId);

        // 2. 현재 사용자가 active 멤버인지 확인
        validateActiveMember(
                jarId,
                currentUserId,
                "현재 저금통 멤버만 새 채팅을 조회할 수 있어요."
        );

        // 3. limit 정리
        int safeLimit = normalizeLimit(limit);

        // 4. 새 메시지를 오래된순으로 조회한다.
        List<ChatMessage> fetchedMessages = chatMessageRepository.findMessagesAfter(
                jarId,
                afterMessageId,
                PageRequest.of(0, safeLimit + 1)
        );

        // 5. 새 메시지가 더 남아 있는지 확인
        boolean hasNext = fetchedMessages.size() > safeLimit;

        // 6. 실제 응답에는 safeLimit개까지만 담는다.
        List<ChatMessage> limitedMessages = fetchedMessages.stream()
                .limit(safeLimit)
                .toList();

        // 7. Entity를 Response DTO로 변환한다.
        List<ChatMessageResponse> items = limitedMessages.stream()
                .map(message -> toChatMessageResponse(message, currentUserId))
                .toList();

        // 8. Polling 새 메시지 조회에서는 nextBeforeMessageId를 쓰지 않는다.
        // 프론트는 items의 마지막 messageId를 afterMessageId로 다시 보내면 된다.
        return ChatMessageListResponse.of(items, hasNext, null);
    }

    /*
     * 채팅 읽음 처리
     *
     * 사용 상황:
     * POST /api/v1/jars/{jarId}/chat/read
     *
     * 예:
     * 프론트가 "나는 25번 메시지까지 봤어"라고 보내면 chat_read_state에 마지막 읽은 메시지를 25번으로 저장한다.
     */
    @Transactional
    public void markAsRead(
            Long currentUserId,
            Long jarId,
            ChatReadRequest request
    ) {

        // 1. 현재 로그인한 사용자 찾기
        User currentUser = getUserOrThrow(currentUserId);

        // 2. 저금통 찾기
        Jar jar = getJarOrThrow(jarId);

        // 3. 현재 사용자가 active 멤버인지 확인
        validateActiveMember(
                jarId,
                currentUserId,
                "현재 저금통 멤버만 채팅 읽음 처리를 할 수 있어요."
        );

        // 4. 사용자가 읽었다고 보낸 메시지가 진짜 이 저금통 메시지인지 확인
        ChatMessage lastReadMessage = chatMessageRepository
                .findByJar_JarIdAndMessageId(jarId, request.lastReadMessageId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "읽음 처리할 채팅 메시지를 찾을 수 없어요."
                ));

        // 5. 기존 읽음 상태를 잠금 조회한다.
        // 동시에 여러 read 요청이 와도 책갈피가 꼬이지 않게 하기 위함이다.
        ChatReadState readState = chatReadStateRepository
                .findForUpdateByJarIdAndUserId(jarId, currentUserId)
                .orElseGet(() -> ChatReadState.create(jar, currentUser));

        // 6. 마지막 읽은 위치 갱신
        // ChatReadState 내부에서 더 최신 메시지일 때만 앞으로 이동한다.
        readState.markAsRead(lastReadMessage);

        // 7. 새로 만든 readState라면 저장하고,
        // 기존 readState라면 JPA 변경 감지로 자동 update 된다.
        chatReadStateRepository.save(readState);
    }

    /*
     * 안 읽은 채팅 개수 조회
     *
     * 사용 상황:
     * GET /api/v1/jars/{jarId}/chat/unread
     *
     * unread 계산:
     * - lastReadMessageId 이후의 메시지 수를 센다.
     * - 내가 보낸 메시지는 unread로 세지 않는다.
     */
    public ChatUnreadResponse getUnreadCount(
            Long currentUserId,
            Long jarId
    ) {

        // 1. 저금통 존재 확인
        getJarOrThrow(jarId);

        // 2. 현재 사용자가 active 멤버인지 확인
        validateActiveMember(
                jarId,
                currentUserId,
                "현재 저금통 멤버만 안 읽은 채팅 개수를 볼 수 있어요."
        );

        // 3. 내 읽음 상태 조회
        Long lastReadMessageId = chatReadStateRepository
                .findWithLastReadMessageByJarIdAndUserId(jarId, currentUserId)
                .map(ChatReadState::getLastReadMessageId)
                .orElse(null);

        // 4. 마지막 읽은 메시지 이후의 메시지 개수 조회
        long unreadCount = chatMessageRepository.countUnreadMessages(
                jarId,
                currentUserId,
                lastReadMessageId
        );

        // 5. 응답 반환
        return new ChatUnreadResponse(jarId, unreadCount);
    }

    // 사용자 찾기
    // userId에 해당하는 사용자가 없으면 404를 던진다.
    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "사용자를 찾을 수 없어요."
                ));
    }

    // 저금통 찾기
    // jarId에 해당하는 저금통이 없으면 404를 던진다.
    private Jar getJarOrThrow(Long jarId) {
        return jarRepository.findByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어요."
                ));
    }

    /*
     * 현재 사용자가 해당 저금통의 active 멤버인지 확인
     *
     * active 멤버란:
     * - jar_members에 row가 있고
     * - deleted_at이 null인 상태
     *
     * 멤버가 아니면 채팅 조회/전송/읽음 처리를 막는다.
     */
    private void validateActiveMember(
            Long jarId,
            Long currentUserId,
            String message
    ) {
        boolean activeMember = jarMemberRepository
                .existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId);

        if (!activeMember) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    message
            );
        }
    }

    /*
     * limit 값 정리
     *
     * 프론트가 limit을 안 보내면 기본 30개
     * 1보다 작으면 기본 30개
     * 100보다 크면 최대 100개로 제한
     *
     * 이렇게 하는 이유:
     * - 한 번에 너무 많은 채팅을 가져오면 DB와 서버가 힘들어질 수 있기 때문
     */
    private int normalizeLimit(Integer limit) {
        if (limit == null || limit < 1) {
            return DEFAULT_LIMIT;
        }

        return Math.min(limit, MAX_LIMIT);
    }

    /*
     * ChatMessage 엔티티를 화면용 DTO로 변환
     *
     * mine 값:
     * - 현재 로그인한 사용자가 보낸 메시지면 true
     * - 다른 사람이 보냈거나 시스템 메시지면 false
     *
     * 프론트에서는 mine=true면 오른쪽 말풍선,
     * mine=false면 왼쪽 또는 시스템 메시지로 보여줄 수 있다.
     */
    private ChatMessageResponse toChatMessageResponse(
            ChatMessage message,
            Long currentUserId
    ) {
        User sender = message.getSender();

        Long senderId = sender == null ? null : sender.getId();
        String senderName = sender == null ? null : sender.getName();

        boolean mine = senderId != null && senderId.equals(currentUserId);

        return new ChatMessageResponse(
                message.getMessageId(),
                message.getJar().getJarId(),
                senderId,
                senderName,
                message.getType(),
                message.getContent(),
                mine,
                message.getCreatedAt()
        );
    }
}