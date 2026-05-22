package shop.esjh.memoryjar.dto.dailydraw.response;

import java.time.LocalDate;

/*
 * Daily Draw 히스토리 목록의 한 줄을 담당한다.
 *
 * 쉽게 말하면:
 * - 2026-05-04에 어떤 쪽지가 뽑혔는지
 * - 그 쪽지 제목과 작성자가 누구인지
 * 를 목록에서 보여주기 위한 작은 응답이다.
 */
public record DailyDrawHistoryItem(

        // Daily Draw 기록 번호
        Long drawId,

        // 저금통 번호
        Long jarId,

        // 뽑힌 날짜
        LocalDate drawDate,

        // 뽑힌 쪽지 번호
        Long noteId,

        // 뽑힌 쪽지 제목
        String title,

        // 쪽지 작성자 번호
        Long authorId,

        // 쪽지 작성자 이름
        String authorName,

        // 실제 추억 날짜
        LocalDate noteDate,

        // 추억 장소
        String location
) {
}