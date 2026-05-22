package shop.esjh.memoryjar.dto.dailydraw.response;

// "오늘 뽑힌 카드가 있는지 조회"할 때 사용하는 응답
public record DailyDrawTodayResponse(

        // 오늘 카드가 이미 뽑혔는지 여부
        boolean hasTodayDraw,

        // 오늘 카드 정보
        // 아직 오늘 카드가 없으면 null
        DailyDrawResponse dailyDraw,

        // 프론트에서 안내 문구로 사용할 수 있는 메시지
        String message
) {

    // 오늘 카드가 있을 때 사용하는 생성 메서드
    public static DailyDrawTodayResponse found(DailyDrawResponse dailyDraw) {
        return new DailyDrawTodayResponse(
                true,
                dailyDraw,
                "오늘의 추억 한 장이 공개되었어요."
        );
    }

    // 오늘 카드가 아직 없을 때 사용하는 생성 메서드
    public static DailyDrawTodayResponse empty() {
        return new DailyDrawTodayResponse(
                false,
                null,
                "아직 오늘의 추억 한 장이 뽑히지 않았어요."
        );
    }
}