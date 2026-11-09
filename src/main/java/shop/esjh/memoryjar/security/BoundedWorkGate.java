package shop.esjh.memoryjar.security;

import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** 메모리를 많이 쓰는 작업의 동시 실행 수를 제한한다. 대기열을 쌓지 않고 재시도 가능한 429를 반환한다. */
public final class BoundedWorkGate {
    private final Semaphore slots;

    public BoundedWorkGate(int capacity) {
        if (capacity < 1) throw new IllegalArgumentException("처리 슬롯은 하나 이상이어야 합니다.");
        slots = new Semaphore(capacity, true);
    }

    /** 파일 읽기·비밀번호 검증 전에 확보하고 try-with-resources로 예외 시에도 반드시 돌려준다. */
    public Permit acquire() {
        if (!slots.tryAcquire()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "다른 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.");
        }
        return new Permit();
    }

    public final class Permit implements AutoCloseable {
        private final AtomicBoolean released = new AtomicBoolean();
        @Override public void close() {
            if (released.compareAndSet(false, true)) slots.release();
        }
    }
}
