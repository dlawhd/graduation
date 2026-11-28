package shop.esjh.memoryjar.repository.notification;

import shop.esjh.memoryjar.entity.notification.Notification;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    // 내 알림 목록을 페이지 형태로 조회하는 메서드
    Page<Notification> findByUser_IdAndDeletedAtIsNull(Long userId, Pageable pageable);

    // 안 읽은 알림 개수를 세는 메서드
    long countByUser_IdAndIsReadFalseAndDeletedAtIsNull(Long userId);

    // "내 알림 1개"를 찾는 메서드
    Optional<Notification> findByNotificationIdAndUser_IdAndDeletedAtIsNull(Long notificationId, Long userId);

    /** 같은 문의를 가리키는 내 미확인 알림만 읽음 처리한다. */
    @Modifying
    @Query(value = """
            update notifications
               set is_read = true, read_at = :now
             where user_id = :userId and is_read = false and deleted_at is null
               and json_value(payload_json, '$.inquiryId') = :inquiryId
               and ((:operator = true and type in ('SUPPORT_INQUIRY_RECEIVED', 'SUPPORT_FOLLOWED_UP'))
                 or (:operator = false and type = 'SUPPORT_REPLIED'))
            """, nativeQuery = true)
    int markSupportInquiryAsRead(Long userId, Long inquiryId, boolean operator, LocalDateTime now);

    /** 열린 저금통, 쪽지 또는 화면에 펼쳐진 댓글과 일치하는 내 알림만 처리한다. */
    @Modifying
    @Query(value = """
            update notifications
               set is_read = true, read_at = :now
             where user_id = :userId and jar_id = :jarId and is_read = false and deleted_at is null
               and ((:noteId = 0 and type = 'JAR_MEMBER_JOINED')
                 or (:noteId > 0 and json_value(payload_json, '$.noteId') = :noteId
                     and (type = 'NOTE_REACTED'
                       or (type in ('NOTE_COMMENTED', 'COMMENT_REPLIED')
                           and json_value(payload_json, '$.commentId') in (:commentIds)))))
            """, nativeQuery = true)
    int markJarTargetAsRead(Long userId, long jarId, long noteId, List<Long> commentIds, LocalDateTime now);

    // 내 안 읽은 알림을 한 번에 전부 읽음 처리하는 메서드
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("""
            update Notification n
               set n.isRead = true,
                   n.readAt = :now
             where n.user.id = :userId
               and n.isRead = false
               and n.deletedAt is null
            """)
    int markAllAsRead(Long userId, LocalDateTime now);
}