package shop.esjh.memoryjar.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** DB에 확정된 작업의 성공 여부를 바꾸지 않도록, 실시간 알림 전송 실패만 따로 기록한다. */
public final class BestEffortDelivery {
    private static final Logger log = LoggerFactory.getLogger(BestEffortDelivery.class);

    private BestEffortDelivery() { }

    /** 전송 실패가 저장 성공 응답이나 다음 수신자에게 보낼 알림을 막지 않게 한다. */
    public static void send(String eventType, Runnable delivery) {
        try {
            delivery.run();
        } catch (RuntimeException failure) {
            // 예외 메시지에는 사진 주소나 본문이 들어갈 수 있어 고정 이벤트명과 예외 종류만 남긴다.
            // DB 기록은 유지되므로 재조회로 복구한다. 이 메서드는 전송 보장 큐를 대신하지 않는다.
            log.warn("REALTIME_DELIVERY_FAILED eventType={} failureType={}", eventType, failure.getClass().getSimpleName());
        }
    }
}
