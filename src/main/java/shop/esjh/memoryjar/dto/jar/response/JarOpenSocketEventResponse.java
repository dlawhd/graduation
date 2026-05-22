package shop.esjh.memoryjar.dto.jar.response;

import java.time.OffsetDateTime;

/*
 * JarOpenSocketEventResponse 역할
 *
 * 이 DTO는 저금통이 열렸을 때 WebSocket으로 프론트에게 보내는 알림 모양이다.
 *
 * 쉽게 말하면:
 * - "몇 번 저금통이 열렸는지"
 * - "무슨 일이 생겼는지"
 * - "지금 열린 상태인지"
 * - "언제 열렸는지"
 * - "화면에 보여줄 문구가 뭔지"
 * 를 담아서 프론트로 보내는 작은 편지다.
 */
public record JarOpenSocketEventResponse(
        Long jarId,              // 열린 저금통 id
        String eventType,        // 이벤트 이름, 지금은 JAR_OPENED
        boolean isOpen,          // 프론트가 바로 jar.isOpen=true 로 바꿀 수 있게 주는 값
        OffsetDateTime openedAt, // 저금통이 열린 시간
        String message           // 화면이나 콘솔에 보여줄 안내 문구
) {

    /*
     * 저금통 오픈 이벤트 응답을 만드는 정적 메서드
     *
     * 정적 메서드로 빼두면 나중에 new JarOpenSocketEventResponse(...)를
     * 여기저기서 직접 만들지 않아도 돼서 실수가 줄어든다.
     */
    public static JarOpenSocketEventResponse jarOpened(
            Long jarId,
            OffsetDateTime openedAt
    ) {
        return new JarOpenSocketEventResponse(
                jarId,
                "JAR_OPENED",
                true,
                openedAt,
                "저금통이 열렸어요."
        );
    }
}