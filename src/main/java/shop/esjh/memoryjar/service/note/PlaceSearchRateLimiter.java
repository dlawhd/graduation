package shop.esjh.memoryjar.service.note;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** 서버 한 대에서 사용자별 검색 횟수를 제한한다. 만료 기록을 지우고 메모리 개수도 제한한다. */
@Component
public class PlaceSearchRateLimiter {
    private static final long WINDOW = TimeUnit.MINUTES.toNanos(1);
    private static final long INTERVAL = TimeUnit.SECONDS.toNanos(1);
    private final Map<Long, Window> users = new HashMap<>();

    public void consume(long userId) {
        consume(userId, System.nanoTime());
    }

    /** 같은 계정의 동시 요청도 하나의 잠금 안에서 세어 외부 호출 한도를 우회하지 못하게 한다. */
    synchronized void consume(long userId, long now) {
        Window window = users.get(userId);
        if (window == null || now - window.started >= WINDOW) {
            users.values().removeIf(value -> now - value.started >= WINDOW);
            if (users.size() >= 4096) throw limited();
            users.put(userId, new Window(now));
            return;
        }
        if (window.count >= 20 || now - window.last < INTERVAL) throw limited();
        window.count++;
        window.last = now;
    }

    private static ResponseStatusException limited() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "장소 검색 요청이 많아요. 잠시 후 다시 검색해 주세요.");
    }

    /** 한 계정의 현재 1분 구간만 보관하며 검색어나 장소는 저장하지 않는다. */
    private static final class Window {
        final long started;
        long last;
        int count = 1;
        Window(long now) { started = now; last = now; }
    }
}
