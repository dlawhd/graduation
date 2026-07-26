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
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.chat.ChatMessageRepository;
import shop.esjh.memoryjar.repository.chat.ChatReadStateRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
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

    public ChatService(
            ChatMessageRepository chatMessageRepository,
            ChatReadStateRepository chatReadStateRepository,
            JarRepository jarRepository,
            JarMemberRepository jarMemberRepository,
            UserRepository userRepository
    ) {
        this.chatMessageRepository = chatMessageRepository;
        this.chatReadStateRepository = chatReadStateRepository;
        this.jarRepository = jarRepository;
        this.jarMemberRepository = jarMemberRepository;
        this.userRepository = userRepository;
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
     * 채팅 메시지 목록 조회
     *
     * 사용 상황:
     * GET /api/v1/jars/{jarId}/chat/messages?beforeMessageId=100&limit=30
     *
     * beforeMessageId가 null이면:
     * - 채팅방 첫 진입이다.
     * - 안 읽은 메시지가 있으면 첫 번째 안 읽은 메시지부터 보여준다.
     * - 안 읽은 메시지가 없으면 기존처럼 최신 메시지를 보여준다.
     *
     * beforeMessageId가 있으면:
     * - 그 메시지보다 오래된 메시지를 가져온다.
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

        // 4. 현재 사용자의 마지막 읽음 위치를 조회한다.
        Long lastReadMessageId = findLastReadMessageId(jarId, currentUserId);

        // 5. 첫 번째 안 읽은 메시지 ID를 조회한다.
        Long firstUnreadMessageId = findFirstUnreadMessageId(
                jarId,
                currentUserId,
                lastReadMessageId
        );

        // 6. 채팅방 첫 진입이고 안 읽은 메시지가 있으면
        // 최신 메시지가 아니라 첫 번째 안 읽은 메시지부터 보여준다.
        if (beforeMessageId == null && firstUnreadMessageId != null) {
            return getMessagesFromFirstUnread(
                    currentUserId,
                    jarId,
                    safeLimit,
                    lastReadMessageId,
                    firstUnreadMessageId
            );
        }

        // 7. 안 읽은 메시지가 없거나, 이전 메시지 더 보기 요청이면 기존 방식대로 조회한다.
        return getLatestOrOlderMessages(
                currentUserId,
                jarId,
                beforeMessageId,
                safeLimit,
                lastReadMessageId,
                firstUnreadMessageId
        );
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

        /*
         * 3. 현재 사용자의 active 멤버 row를 잠근다.
         *
         * 단순 권한 검사만 하는 것이 아니라,
         * 같은 사용자에게 동시에 들어온 읽음 요청을 한 줄로 세운다.
         *
         * chat_read_state가 아직 없어도 jar_members는 반드시 있으므로
         * 첫 읽음 상태 생성 시 발생할 수 있는 UNIQUE 충돌을 막을 수 있다.
         */
        lockActiveMemberOrThrow(
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
     * 현재 사용자의 active 멤버 row를 잠그고 권한도 함께 확인한다.
     *
     * 사용 위치:
     * - 채팅 읽음 상태를 만들거나 수정할 때
     *
     * 일반 validateActiveMember와 다른 점:
     * - 일반 검사는 멤버인지 확인만 한다.
     * - 이 메서드는 멤버 row를 잠가서 동시 요청도 차례대로 처리한다.
     */
    private void lockActiveMemberOrThrow(
            Long jarId,
            Long currentUserId,
            String message
    ) {
        jarMemberRepository
                .findActiveMemberForUpdateByJarIdAndUserId(
                        jarId,
                        currentUserId
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        message
                ));
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

    /*
     * 마지막 읽은 메시지 ID 조회
     *
     * 읽음 상태가 없으면 null을 반환한다.
     * null은 "아직 읽음 책갈피가 없다"는 뜻이다.
     */
    private Long findLastReadMessageId(Long jarId, Long currentUserId) {
        return chatReadStateRepository
                .findWithLastReadMessageByJarIdAndUserId(jarId, currentUserId)
                .map(ChatReadState::getLastReadMessageId)
                .orElse(null);
    }

    /*
     * 첫 번째 안 읽은 메시지 ID 조회
     *
     * unread 기준은 "마지막 읽은 메시지 이후"이면서
     * "내가 보낸 메시지가 아닌 메시지"다.
     */
    private Long findFirstUnreadMessageId(
            Long jarId,
            Long currentUserId,
            Long lastReadMessageId
    ) {
        return chatMessageRepository.findFirstUnreadMessageIds(
                        jarId,
                        currentUserId,
                        lastReadMessageId,
                        PageRequest.of(0, 1)
                )
                .stream()
                .findFirst()
                .orElse(null);
    }

    /*
     * 첫 번째 안 읽은 메시지부터 채팅 목록 조회
     *
     * 사용 상황:
     * - 채팅방을 처음 열었고
     * - 사용자가 안 읽은 메시지가 있을 때
     *
     * 이렇게 하면 화면이 최신 메시지 맨 아래가 아니라
     * 첫 번째 안 읽은 메시지를 기준으로 열릴 수 있다.
     */
    private ChatMessageListResponse getMessagesFromFirstUnread(
            Long currentUserId,
            Long jarId,
            int safeLimit,
            Long lastReadMessageId,
            Long firstUnreadMessageId
    ) {
        List<ChatMessage> fetchedMessages = chatMessageRepository.findMessagesFrom(
                jarId,
                firstUnreadMessageId,
                PageRequest.of(0, safeLimit)
        );

        List<ChatMessageResponse> items = fetchedMessages.stream()
                .map(message -> toChatMessageResponse(message, currentUserId))
                .toList();

        Long nextBeforeMessageId = fetchedMessages.isEmpty()
                ? null
                : fetchedMessages.get(0).getMessageId();

        boolean hasNext = nextBeforeMessageId != null
                && chatMessageRepository.existsByJar_JarIdAndMessageIdLessThan(
                jarId,
                nextBeforeMessageId
        );

        return ChatMessageListResponse.of(
                items,
                hasNext,
                nextBeforeMessageId,
                lastReadMessageId,
                firstUnreadMessageId
        );
    }

    /*
     * 기존 채팅 목록 조회
     *
     * 사용 상황:
     * - 안 읽은 메시지가 없어서 최신 메시지를 보여줄 때
     * - 위로 스크롤해서 이전 메시지를 더 불러올 때
     */
    private ChatMessageListResponse getLatestOrOlderMessages(
            Long currentUserId,
            Long jarId,
            Long beforeMessageId,
            int safeLimit,
            Long lastReadMessageId,
            Long firstUnreadMessageId
    ) {
        List<ChatMessage> fetchedMessages = chatMessageRepository.findMessagesBefore(
                jarId,
                beforeMessageId,
                PageRequest.of(0, safeLimit + 1)
        );

        boolean hasNext = fetchedMessages.size() > safeLimit;

        List<ChatMessage> limitedMessages = fetchedMessages.stream()
                .limit(safeLimit)
                .toList();

        List<ChatMessage> orderedMessages = limitedMessages.stream()
                .sorted(Comparator.comparing(ChatMessage::getMessageId))
                .toList();

        List<ChatMessageResponse> items = orderedMessages.stream()
                .map(message -> toChatMessageResponse(message, currentUserId))
                .toList();

        Long nextBeforeMessageId = orderedMessages.isEmpty()
                ? null
                : orderedMessages.get(0).getMessageId();

        return ChatMessageListResponse.of(
                items,
                hasNext,
                nextBeforeMessageId,
                lastReadMessageId,
                firstUnreadMessageId
        );
    }
}