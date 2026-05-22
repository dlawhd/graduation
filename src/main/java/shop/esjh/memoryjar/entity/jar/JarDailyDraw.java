package shop.esjh.memoryjar.entity.jar;

import shop.esjh.memoryjar.entity.BaseEntity;
import shop.esjh.memoryjar.entity.note.Note;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDate;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(
        name = "jar_daily_draws",
        uniqueConstraints = {
                /*
                 * JPA 코드만 봐도 "저금통 + 날짜"는 중복되면 안 된다는 걸 알 수 있게 적어둔다.
                 * 실제 중복 방지는 V21 Flyway의 UNIQUE 제약이 담당한다.
                 */
                @UniqueConstraint(
                        name = "uq_jar_daily_draws_jar_date",
                        columnNames = {"jar_id", "draw_date"}
                )
        },
        indexes = {
                /*
                 * 저금통별 Daily Draw 히스토리를 빠르게 조회하기 위한 인덱스다.
                 * 예: 특정 저금통의 지난 추억 카드 목록 조회
                 */
                @Index(
                        name = "idx_jar_daily_draws_jar_deleted_date",
                        columnList = "jar_id, deleted_at, draw_date"
                ),

                /*
                 * 특정 쪽지가 Daily Draw에 뽑힌 적 있는지 확인할 때 도움 되는 인덱스다.
                 */
                @Index(
                        name = "idx_jar_daily_draws_note_id",
                        columnList = "note_id"
                )
        }
)
@SQLDelete(sql = "UPDATE jar_daily_draws SET deleted_at = NOW(), updated_at = NOW() WHERE draw_id = ?")
@SQLRestriction("deleted_at IS NULL")
public class JarDailyDraw extends BaseEntity {

    // 오늘의 추억 한 장 기록마다 붙는 고유 번호표
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "draw_id")
    private Long drawId;

    // 어느 저금통에서 뽑힌 카드인지 저장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "jar_id", nullable = false)
    private Jar jar;

    // 오늘 뽑힌 쪽지가 무엇인지 저장
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "note_id", nullable = false)
    private Note note;

    // 어느 날짜의 오늘 카드인지 저장
    // 예: 2026-05-04
    @Column(name = "draw_date", nullable = false)
    private LocalDate drawDate;

    @Builder
    private JarDailyDraw(
            Jar jar,
            Note note,
            LocalDate drawDate
    ) {
        this.jar = jar;
        this.note = note;
        this.drawDate = drawDate;
    }

    /*
     * Daily Draw 기록 생성 메서드
     *
     * 예:
     * JarDailyDraw.create(jar, note, LocalDate.now());
     *
     * 이렇게 만들면 Service 코드에서 의미가 더 잘 보인다.
     */
    public static JarDailyDraw create(
            Jar jar,
            Note note,
            LocalDate drawDate
    ) {
        return JarDailyDraw.builder()
                .jar(jar)
                .note(note)
                .drawDate(drawDate)
                .build();
    }

    /*
     * 이 기록이 특정 저금통의 기록인지 확인한다.
     *
     * 왜 필요하냐면?
     * - 서비스나 테스트에서 "이 Daily Draw가 진짜 이 jarId 소속이 맞나?"
     *   확인할 때 읽기 좋게 쓰기 위해서다.
     */
    public boolean isJar(Long jarId) {
        return jar != null && jar.getJarId().equals(jarId);
    }

    /*
     * 이 기록이 특정 쪽지를 뽑은 기록인지 확인한다.
     *
     * 예:
     * dailyDraw.isNote(noteId)
     */
    public boolean isNote(Long noteId) {
        return note != null && note.getNoteId().equals(noteId);
    }

    /*
     * 이 기록이 특정 날짜의 Daily Draw인지 확인한다.
     *
     * 예:
     * dailyDraw.isDrawDate(LocalDate.now());
     */
    public boolean isDrawDate(LocalDate drawDate) {
        return this.drawDate != null && this.drawDate.equals(drawDate);
    }
}