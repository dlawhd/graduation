"""인증 실패 뒤 계측이 끊겨도 늦은 서버 처리를 기다린 후 시험 세션을 정리하도록 돕는다."""
import time


def settle_after_failure(pump, seconds=30, clock=time.monotonic, pause=time.sleep):
    """지표 수집 실패를 관측 종료로 오인하지 않고 최소 대기 시간을 끝까지 지킨다."""
    deadline = clock() + seconds
    failures = 0
    while clock() < deadline:
        started = clock()
        try:
            pump(min(1, deadline - started))
        except Exception:
            # GC 동안 관리 API도 응답하지 못할 수 있다. 추가 인증 없이 기다리는 동작은 유지한다.
            failures += 1
        elapsed = clock() - started
        remaining = deadline - clock()
        if remaining > 0 and elapsed < 0.05:
            pause(min(0.1, remaining))
    return {'settleSeconds': seconds, 'collectionFailures': failures}
