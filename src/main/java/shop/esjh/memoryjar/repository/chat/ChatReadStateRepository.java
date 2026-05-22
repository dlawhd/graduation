package shop.esjh.memoryjar.repository.chat;

import shop.esjh.memoryjar.entity.chat.ChatReadState;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/*
 * 예:
 * - xx가 10번 저금통에서 25번 메시지까지 읽음
 * - 그러면 jarId=10, userId=xx, lastReadMessageId=25 형태로 저장됨
 *
 * 이 값이 있어야 unread count를 계산할 수 있다.
 */
public interface ChatReadStateRepository extends JpaRepository<ChatReadState, Long> {

    /*
     * 특정 사용자, 특정 저금통의 읽음 상태 찾기
     *
     * 사용 예:
     * - unread count 계산할 때, lastReadMessageId가 몇 번인지 알아내야 함
     */
    Optional<ChatReadState> findByJar_JarIdAndUser_Id(Long jarId, Long userId);

    /*
     * lastReadMessage까지 같이 가져오는 조회
     *
     * 왜 left join fetch를 쓰냐면?
     * - ChatReadState 안의 lastReadMessage는 지연 로딩(LAZY)
     * - 나중에 getLastReadMessageId()를 부를 때 추가 조회가 생길 수 있음
     * - 그래서 필요한 경우 한 번에 같이 가져온다.
     */
    @Query("""
        select crs
        from ChatReadState crs
        left join fetch crs.lastReadMessage
        where crs.jar.jarId = :jarId
        and crs.user.id = :userId
    """)
    Optional<ChatReadState> findWithLastReadMessageByJarIdAndUserId(
            @Param("jarId") Long jarId,
            @Param("userId") Long userId
    );

    /*
     * 읽음 상태를 수정하기 전에 row를 잠그고 가져오기
     *
     * 왜 잠그냐면?
     * - 사용자가 채팅방에 들어가 있고
     * - polling/read 요청이 거의 동시에 여러 번 들어올 수 있음
     *
     * 그때 동시에 lastReadMessage를 바꾸면 꼬일 수 있으니,
     * "한 명씩 차례대로 수정하자"는 의미로 잠근다.
     *
     * 쉽게 말하면:
     * - 책갈피를 동시에 두 사람이 움직이지 못하게
     * - 잠깐 잡고 수정하는 느낌
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select crs
        from ChatReadState crs
        left join fetch crs.lastReadMessage
        where crs.jar.jarId = :jarId
        and crs.user.id = :userId
    """)
    Optional<ChatReadState> findForUpdateByJarIdAndUserId(
            @Param("jarId") Long jarId,
            @Param("userId") Long userId
    );

    /*
     * 특정 저금통에서 특정 사용자의 읽음 상태가 이미 있는지 확인
     *
     * 사용 예:
     * - 없으면 ChatReadState.create(jar, user)로 새로 만들기
     * - 있으면 기존 row의 lastReadMessage만 갱신하기
     */
    boolean existsByJar_JarIdAndUser_Id(Long jarId, Long userId);
}