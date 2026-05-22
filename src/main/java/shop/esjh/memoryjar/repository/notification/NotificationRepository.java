package shop.esjh.memoryjar.repository.notification;

import shop.esjh.memoryjar.entity.notification.Notification;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    // 내 알림 목록을 페이지 형태로 조회하는 메서드
    Page<Notification> findByUser_IdAndDeletedAtIsNull(Long userId, Pageable pageable);

    // 안 읽은 알림 개수를 세는 메서드
    long countByUser_IdAndIsReadFalseAndDeletedAtIsNull(Long userId);

    // "내 알림 1개"를 찾는 메서드
    Optional<Notification> findByNotificationIdAndUser_IdAndDeletedAtIsNull(Long notificationId, Long userId);

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