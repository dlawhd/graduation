package shop.esjh.memoryjar.service.chat;

import shop.esjh.memoryjar.dto.chat.response.ChatSocketMessageResponse;
import shop.esjh.memoryjar.entity.chat.ChatMessage;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.jar.JarRole;
import shop.esjh.memoryjar.repository.chat.ChatMessageRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/*
 * ChatSystemMessageService 역할
 *
 * 이 서비스는 사용자가 직접 입력한 채팅이 아니라,
 * 서버가 자동으로 만들어주는 "시스템 메시지"를 담당한다.
 *
 * 예를 들면:
 * - xx님이 저금통에 들어왔어요.
 * - aa님이 저금통을 나갔어요.
 * - ee님의 역할이 관리자로 바뀌었어요.
 *
 * 핵심 흐름:
 * 1. chat_messages 테이블에 type = SYSTEM 메시지를 저장한다.
 * 2. DB 커밋이 성공한 뒤에만 WebSocket으로 채팅방에 뿌린다.
 *
 * 왜 afterCommit을 쓰냐면?
 * - DB 저장은 실패했는데 화면에만 시스템 메시지가 보이면 이상하기 때문.
 * - 그래서 "DB 성공 → 화면 전송" 순서로 맞춘다.
 */
@Service
@Transactional
public class ChatSystemMessageService {

    // 시스템 메시지를 chat_messages 테이블에 저장하기 위한 Repository
    private final ChatMessageRepository chatMessageRepository;

    // /topic/jars/{jarId}/chat 을 구독 중인 사용자들에게 메시지를 보내는 도구
    private final SimpMessagingTemplate messagingTemplate;

    public ChatSystemMessageService(
            ChatMessageRepository chatMessageRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.chatMessageRepository = chatMessageRepository;
        this.messagingTemplate = messagingTemplate;
    }

    // 멤버가 저금통에 들어왔을 때 남길 시스템 메시지
    public ChatSocketMessageResponse createAndSendMemberJoinedMessage(
            Jar jar,
            String memberName
    ) {
        String content = safeName(memberName) + "님이 저금통에 들어왔어요.";
        return createAndSendSystemMessage(jar, content);
    }

    // 멤버가 저금통을 직접 나갔을 때 남길 시스템 메시지
    public ChatSocketMessageResponse createAndSendMemberLeftMessage(
            Jar jar,
            String memberName
    ) {
        String content = safeName(memberName) + "님이 저금통을 나갔어요.";
        return createAndSendSystemMessage(jar, content);
    }

    // 관리자가 멤버를 내보냈을 때 남길 시스템 메시지
    public ChatSocketMessageResponse createAndSendMemberKickedMessage(
            Jar jar,
            String targetMemberName
    ) {
        String content = safeName(targetMemberName) + "님이 저금통에서 내보내졌어요.";
        return createAndSendSystemMessage(jar, content);
    }

    // 멤버 역할이 변경됐을 때 남길 시스템 메시지
    public ChatSocketMessageResponse createAndSendMemberRoleChangedMessage(
            Jar jar,
            String targetMemberName,
            JarRole newRole
    ) {
        String content = safeName(targetMemberName)
                + "님의 역할이 "
                + toRoleLabel(newRole)
                + "로 바뀌었어요.";

        return createAndSendSystemMessage(jar, content);
    }

    // 저금통이 열렸을 때 남길 시스템 메시지
    public ChatSocketMessageResponse createAndSendJarOpenedMessage(Jar jar) {
        String content = "저금통이 열렸어요. 이제 추억을 확인할 수 있어요!";
        return createAndSendSystemMessage(jar, content);
    }

    /*
     * 실제 시스템 메시지를 저장하고 WebSocket으로 보내는 공통 메서드
     * 모든 시스템 메시지는 결국 여기로 모인다.
     */
    private ChatSocketMessageResponse createAndSendSystemMessage(
            Jar jar,
            String content
    ) {

        // 1. SYSTEM 타입 채팅 메시지 엔티티를 만든다.
        // sender는 null이다. 사람이 직접 보낸 메시지가 아니기 때문이다.
        ChatMessage systemMessage = ChatMessage.createSystem(jar, content);

        // 2. DB에 저장한다.
        // saveAndFlush를 쓰는 이유:
        // - messageId, createdAt 같은 값이 바로 채워져야
        // - WebSocket으로 보낼 응답 DTO를 안전하게 만들 수 있기 때문이다.
        ChatMessage savedMessage = chatMessageRepository.saveAndFlush(systemMessage);

        // 3. WebSocket으로 보낼 DTO를 만든다.
        ChatSocketMessageResponse socketMessage = toSocketMessage(savedMessage);

        // 4. DB 커밋 성공 후 채팅방 구독자들에게 전송한다.
        sendAfterCommit(jar.getJarId(), socketMessage);

        // 5. 테스트나 다른 내부 로직에서 확인할 수 있도록 저장된 메시지를 반환한다.
        return socketMessage;
    }

    /*
     * ChatMessage 엔티티를 WebSocket 전송용 DTO로 바꾸는 메서드
     *
     * SYSTEM 메시지는 sender가 없으므로 senderId, senderName은 null이다.
     */
    private ChatSocketMessageResponse toSocketMessage(ChatMessage message) {
        return new ChatSocketMessageResponse(
                message.getMessageId(),
                message.getJar().getJarId(),
                null,
                null,
                message.getType(),
                message.getContent(),
                message.getCreatedAt()
        );
    }

    // DB 커밋이 성공한 뒤에만 WebSocket 메시지를 보내는 메서드
    private void sendAfterCommit(
            Long jarId,
            ChatSocketMessageResponse socketMessage
    ) {
        // 채팅 구독 주소
        String destination = "/topic/jars/" + jarId + "/chat";

        // 현재 트랜잭션 동기화가 켜져 있으면 afterCommit으로 보낸다.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            messagingTemplate.convertAndSend(destination, socketMessage);
                        }
                    }
            );
            return;
        }

        // 혹시 트랜잭션 밖에서 호출되는 경우에는 바로 보낸다.
        messagingTemplate.convertAndSend(destination, socketMessage);
    }

    // 이름이 비어 있을 때 화면에 이상하게 보이지 않도록 안전한 이름으로 바꿔준다.
    private String safeName(String name) {
        if (name == null || name.isBlank()) {
            return "알 수 없는 사용자";
        }

        return name;
    }

    // enum 역할 값을 화면용 한글 문구로 바꿔준다.
    private String toRoleLabel(JarRole role) {
        if (role == JarRole.OWNER) {
            return "방장";
        }

        if (role == JarRole.ADMIN) {
            return "관리자";
        }

        return "멤버";
    }
}