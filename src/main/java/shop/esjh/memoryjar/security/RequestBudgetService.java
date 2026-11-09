package shop.esjh.memoryjar.security;

import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.repository.SecurityRequestLimitRepository;
import shop.esjh.memoryjar.service.support.SupportAccessCrypto;

/** 요청 실패나 비밀번호 오류로 바깥 트랜잭션이 롤백되어도 요청 횟수는 유지하는 공통 제한 서비스다. */
@Service
public class RequestBudgetService {
    private final SecurityRequestLimitRepository budgets;
    private final SupportAccessCrypto crypto;

    public RequestBudgetService(SecurityRequestLimitRepository budgets, SupportAccessCrypto crypto) {
        this.budgets = budgets;
        this.crypto = crypto;
    }

    public record Rule(String identity, int maximum, Duration window) {
        public Rule {
            if (identity == null || maximum < 1 || window == null || window.isZero() || window.isNegative()
                    || window.compareTo(Duration.ofHours(1)) > 0) throw new IllegalArgumentException("요청 제한 설정이 올바르지 않습니다.");
        }
    }

    /** 공통 키의 잠금 순서를 고정하고 모든 예산을 한 번에 확보한 뒤 외부 작업 없이 바로 커밋한다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public void consume(Rule... rules) {
        var now = LocalDateTime.now(ZoneId.of("Asia/Seoul"));
        var ordered = new TreeMap<String, Rule>();
        for (var rule : rules) ordered.put(crypto.privateKey("SECURITY_BUDGET_V1|" + rule.identity()), rule);
        for (var entry : ordered.entrySet()) {
            budgets.ensure(entry.getKey(), now);
            var row = budgets.lock(entry.getKey()).orElseThrow();
            if (!row.consume(entry.getValue().maximum(), entry.getValue().window(), now)) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "요청이 많습니다. 잠시 후 다시 시도해 주세요.");
            }
        }
    }

    /** 가장 긴 제한 창보다 충분히 오래된 익명 카운터만 소량씩 지운다. */
    @Transactional
    public int cleanup() {
        return budgets.deleteExpiredBatch(LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusHours(2));
    }
}
