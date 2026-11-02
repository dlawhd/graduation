package shop.esjh.memoryjar.service.support;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.repository.support.SupportRateLimitRepository;
import shop.esjh.memoryjar.entity.support.SupportRateLimit;
import java.time.Duration;

/** 호출한 DB 트랜잭션에서만 카운터를 잠근다. 외부 이미지 요청 동안 잠금이 유지되지 않게 한다. */
@Service @RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class SupportRateGuard {
    private final SupportRateLimitRepository limits;
    private final SupportAccessCrypto crypto;
    public SupportRateLimit lock(String identity) {
        var now = SupportInquiryPersistenceService.now(); String key = crypto.privateKey(identity);
        limits.ensure(key, now); var row = limits.lock(key).orElseThrow(); row.touch(now); return row;
    }
    public void consume(String identity, int limit, Duration period) {
        if (!lock(identity).consume(limit, period, SupportInquiryPersistenceService.now()))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "문의 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
    }
}
