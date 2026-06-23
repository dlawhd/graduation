package shop.esjh.memoryjar.dto.dailydraw.response;

/*
 * DailyDrawTodayResponse 역할
 *
 * 오늘의 추억 한 장 화면에서 필요한 상태를 내려주는 응답이다.
 *
 * 쉽게 말하면:
 * - 오늘 이미 받은 추억이 있는지
 * - 아직 받을 수 있는 추억이 남아 있는지
 * - 전체 쪽지 중 몇 장을 받았고 몇 장이 남았는지
 * 를 프론트가 한 번에 판단할 수 있게 해준다.
 */
public record DailyDrawTodayResponse(

        // 오늘 카드가 이미 뽑혔는지 여부
        boolean hasTodayDraw,

        // 오늘 카드 정보
        // 아직 오늘 카드가 없으면 null
        DailyDrawResponse dailyDraw,

        // 아직 Daily Draw로 받지 않은 쪽지가 남아 있는지 여부
        boolean hasRemainingNotes,

        // 아직 받지 않은 쪽지 개수
        long remainingCount,

        // Daily Draw 대상으로 볼 수 있는 전체 쪽지 개수
        long totalDrawableCount,

        // 이미 Daily Draw로 받은 쪽지 개수
        long drawnCount,

        // 프론트에서 안내 문구로 사용할 수 있는 메시지
        String message
) {

    // 오늘 카드가 있을 때 사용하는 생성 메서드
    public static DailyDrawTodayResponse found(
            DailyDrawResponse dailyDraw,
            long remainingCount,
            long totalDrawableCount,
            long drawnCount
    ) {
        return new DailyDrawTodayResponse(
                true,
                dailyDraw,
                remainingCount > 0,
                remainingCount,
                totalDrawableCount,
                drawnCount,
                "오늘의 추억 한 장이 공개되었어요."
        );
    }

    // 오늘 카드가 아직 없을 때 사용하는 생성 메서드
    public static DailyDrawTodayResponse empty(
            long remainingCount,
            long totalDrawableCount,
            long drawnCount
    ) {
        return new DailyDrawTodayResponse(
                false,
                null,
                remainingCount > 0,
                remainingCount,
                totalDrawableCount,
                drawnCount,
                resolveEmptyMessage(remainingCount, totalDrawableCount, drawnCount)
        );
    }

    // 오늘 카드가 없을 때 어떤 안내 문구를 보여줄지 정한다.
    private static String resolveEmptyMessage(
            long remainingCount,
            long totalDrawableCount,
            long drawnCount
    ) {
        if (totalDrawableCount <= 0) {
            return "담긴 추억 쪽지가 없어요.";
        }

        if (remainingCount <= 0 && drawnCount > 0) {
            return "모든 추억을 다 열어봤어요.";
        }

        return "아직 오늘 받은 추억이 없어요.";
    }
}