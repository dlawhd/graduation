package shop.esjh.memoryjar.entity.jar;

import shop.esjh.memoryjar.entity.BaseEntity;
import shop.esjh.memoryjar.enums.jar.JarOpenReason;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

// "이 저금통이 실제로 열렸다"는 기록
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(
        name = "jar_open_events",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_jar_open_events_jar_id", columnNames = "jar_id")
        }
)
public class JarOpenEvent extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "jar_id", nullable = false)
    private Jar jar;

    @Column(name = "opened_at", nullable = false)
    private LocalDateTime openedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", nullable = false, length = 30)
    private JarOpenReason reason;

    @Builder
    private JarOpenEvent(Jar jar, LocalDateTime openedAt, JarOpenReason reason) {
        this.jar = jar;
        this.openedAt = openedAt;
        this.reason = reason;
    }

    public static JarOpenEvent create(Jar jar, LocalDateTime openedAt, JarOpenReason reason) {
        return JarOpenEvent.builder()
                .jar(jar)
                .openedAt(openedAt)
                .reason(reason)
                .build();
    }
}