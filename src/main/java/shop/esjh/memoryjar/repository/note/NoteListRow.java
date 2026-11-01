package shop.esjh.memoryjar.repository.note;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 목록 카드에 필요한 값만 읽는다. Note·User 엔티티 관리용 객체와 작성자의 불필요한 열은 생성하지 않는다. */
public record NoteListRow(Long noteId, String title, String content, LocalDate noteDate, String location,
                          Long authorId, String authorName, boolean encrypted, LocalDateTime createdAt,
                          List<String> tags) {
    // 본문은 기존 Java 미리보기 규칙을 유지하기 위해 그대로 읽는다. DB의 문자 수로 임의 절단하지 않는다.
}
