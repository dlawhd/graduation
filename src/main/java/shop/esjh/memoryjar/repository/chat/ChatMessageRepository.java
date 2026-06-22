package shop.esjh.memoryjar.repository.chat;

import shop.esjh.memoryjar.entity.chat.ChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    // 메시지 ID로 채팅 메시지 1개 찾기
    // 예: 읽음 처리할 때 lastReadMessageId가 진짜 존재하는 메시지인지 확인
    Optional<ChatMessage> findByMessageId(Long messageId);

    // 특정 저금통 안에 있는 특정 메시지 1개 찾기
    // 왜 jarId도 같이 확인하냐면?
    // 5번 저금통에서 100번 메시지를 읽었다고 했는데 실제 100번 메시지가 7번 저금통 메시지면 보안 문제가 생김.
    // 그래서 "이 메시지가 진짜 이 저금통 소속인지" 같이 확인한다.
    Optional<ChatMessage> findByJar_JarIdAndMessageId(Long jarId, Long messageId);

    /*
     * 채팅방에 처음 들어갔을 때 또는 이전 메시지를 더 불러올 때 사용
     *
     * beforeMessageId가 null이면:
     * - 최신 메시지부터 limit개 가져옴
     *
     * beforeMessageId가 있으면:
     * - 그 메시지보다 오래된 메시지만 가져옴
     *
     * 정렬을 DESC로 하는 이유:
     * - 최신 메시지부터 빠르게 가져오기 좋음
     * - 화면에 보여줄 때는 Service에서 필요하면 뒤집어서 오래된순으로 내려주면 됨
     *
     * left join fetch cm.sender 이유:
     * - DTO 만들 때 sender 이름을 쓸 가능성이 큼
     * - 메시지마다 sender를 따로 조회하면 N+1 문제가 생길 수 있음
     * - 그래서 메시지와 보낸 사람을 한 번에 가져온다.
     */
    @Query("""
        select cm
        from ChatMessage cm
        left join fetch cm.sender
        where cm.jar.jarId = :jarId
        and (
            :beforeMessageId is null
            or cm.messageId < :beforeMessageId
        )
        order by cm.messageId desc
    """)
    List<ChatMessage> findMessagesBefore(
            @Param("jarId") Long jarId,
            @Param("beforeMessageId") Long beforeMessageId,
            Pageable pageable
    );

    /*
     * Polling에서 새 메시지를 가져올 때 사용
     *
     * afterMessageId가 10이면:
     * - 11번, 12번, 13번 ... 새 메시지만 가져옴
     *
     * 정렬을 ASC로 하는 이유:
     * - 채팅 화면에서는 새 메시지를 오래된 것부터 차례대로 붙이는 게 자연스러움
     *
     * 예:
     * - 마지막으로 화면에 보이는 메시지 ID = 20
     * - 프론트가 2~3초마다 afterMessageId=20으로 요청
     * - 서버는 21번 이후 메시지만 내려줌
     */
    @Query("""
        select cm
        from ChatMessage cm
        left join fetch cm.sender
        where cm.jar.jarId = :jarId
        and (
            :afterMessageId is null
            or cm.messageId > :afterMessageId
        )
        order by cm.messageId asc
    """)
    List<ChatMessage> findMessagesAfter(
            @Param("jarId") Long jarId,
            @Param("afterMessageId") Long afterMessageId,
            Pageable pageable
    );

    /*
     * 특정 저금통의 가장 최신 메시지 1개 찾기
     *
     * 사용 예:
     * - 채팅방 입장 시 최신 메시지까지 읽음 처리하고 싶을 때
     * - unread 계산 기준을 최신 메시지로 맞출 때
     */
    Optional<ChatMessage> findTopByJar_JarIdOrderByMessageIdDesc(Long jarId);

    /*
     * 특정 메시지부터 이후 메시지를 오래된순으로 조회한다.
     *
     * 사용 예:
     * - 채팅방을 처음 열었는데 안 읽은 메시지가 있으면
     * - 첫 번째 안 읽은 메시지부터 화면에 보여주고 싶을 때 사용한다.
     */
    @Query("""
    select cm
    from ChatMessage cm
    left join fetch cm.sender
    where cm.jar.jarId = :jarId
    and cm.messageId >= :fromMessageId
    order by cm.messageId asc
""")
    List<ChatMessage> findMessagesFrom(
            @Param("jarId") Long jarId,
            @Param("fromMessageId") Long fromMessageId,
            Pageable pageable
    );

    /*
     * 첫 번째 안 읽은 메시지 ID 조회
     *
     * lastReadMessageId가 null이면:
     * - 아직 읽음 기록이 없다는 뜻
     * - 내가 보낸 메시지가 아닌 첫 메시지를 찾는다.
     *
     * lastReadMessageId가 있으면:
     * - 그 메시지 이후에서 내가 보낸 메시지가 아닌 첫 메시지를 찾는다.
     */
    @Query("""
    select cm.messageId
    from ChatMessage cm
    where cm.jar.jarId = :jarId
    and (
        :lastReadMessageId is null
        or cm.messageId > :lastReadMessageId
    )
    and (
        cm.sender is null
        or cm.sender.id <> :userId
    )
    order by cm.messageId asc
""")
    List<Long> findFirstUnreadMessageIds(
            @Param("jarId") Long jarId,
            @Param("userId") Long userId,
            @Param("lastReadMessageId") Long lastReadMessageId,
            Pageable pageable
    );

    /*
     * 특정 메시지보다 오래된 메시지가 있는지 확인한다.
     *
     * 사용 예:
     * - 첫 번째 안 읽은 메시지부터 목록을 내려줄 때
     * - 위쪽에 더 오래된 메시지가 있으면 "이전 채팅 더 보기" 버튼을 보여준다.
     */
    boolean existsByJar_JarIdAndMessageIdLessThan(Long jarId, Long messageId);

    /*
     * unread count 계산
     *
     * lastReadMessageId가 null이면:
     * - 아직 읽은 메시지가 없다는 뜻
     * - 해당 저금통의 메시지 중 "내가 보낸 메시지가 아닌 것"을 모두 unread로 계산
     *
     * lastReadMessageId가 있으면:
     * - 그 메시지 이후 메시지만 unread로 계산
     *
     * cm.sender is null 조건을 넣은 이유:
     * - SYSTEM 메시지는 sender가 없을 수 있음
     * - 시스템 메시지는 내가 보낸 메시지가 아니므로 unread에 포함 가능
     *
     * cm.sender.id <> :userId 조건을 넣은 이유:
     * - 내가 직접 보낸 메시지는 보통 unread로 세지 않기 때문
     */
    @Query("""
        select count(cm)
        from ChatMessage cm
        where cm.jar.jarId = :jarId
        and (
            :lastReadMessageId is null
            or cm.messageId > :lastReadMessageId
        )
        and (
            cm.sender is null
            or cm.sender.id <> :userId
        )
    """)
    long countUnreadMessages(
            @Param("jarId") Long jarId,
            @Param("userId") Long userId,
            @Param("lastReadMessageId") Long lastReadMessageId
    );
}