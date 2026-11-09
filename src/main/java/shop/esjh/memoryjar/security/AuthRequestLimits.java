package shop.esjh.memoryjar.security;

import java.time.Duration;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Value;
import shop.esjh.memoryjar.security.RequestBudgetService.Rule;

/** 공개 로그인·인증메일 입구에서 계정/IP/서버 예산과 비밀번호 검증 동시 수를 제한한다. */
@Service
public class AuthRequestLimits {
    private final RequestBudgetService budgets;
    private final TrustedClientAddress clientAddresses;
    private final BoundedWorkGate passwordWork = new BoundedWorkGate(2);
    private final int loginAccount, loginIp, loginGlobal, emailAddress, emailIp, emailGlobal;

    public AuthRequestLimits(RequestBudgetService budgets,
            @Value("${app.security.login-account-per-15-minutes:10}") int loginAccount,
            @Value("${app.security.login-ip-per-minute:60}") int loginIp,
            @Value("${app.security.login-global-per-minute:300}") int loginGlobal,
            @Value("${app.security.email-address-per-hour:5}") int emailAddress,
            @Value("${app.security.email-ip-per-hour:30}") int emailIp,
            @Value("${app.security.email-global-per-hour:300}") int emailGlobal,
            @Value("${app.security.trusted-proxy-addresses:127.0.0.1,::1}") String trustedProxies) {
        if(java.util.stream.IntStream.of(loginAccount,loginIp,loginGlobal,emailAddress,emailIp,emailGlobal).anyMatch(value->value<1))
            throw new IllegalArgumentException("인증 요청 제한은 1 이상이어야 합니다.");
        this.clientAddresses=new TrustedClientAddress(trustedProxies);
        this.budgets = budgets;
        this.loginAccount = loginAccount; this.loginIp = loginIp; this.loginGlobal = loginGlobal;
        this.emailAddress = emailAddress; this.emailIp = emailIp; this.emailGlobal = emailGlobal;
    }

    public String clientAddress(jakarta.servlet.http.HttpServletRequest request) { return clientAddresses.resolve(request); }

    public BoundedWorkGate.Permit beginLogin(String loginId, String clientAddress) {
        budgets.consume(new Rule("login-account:" + normalized(loginId), loginAccount, Duration.ofMinutes(15)),
                new Rule("login-ip:" + clientAddress, loginIp, Duration.ofMinutes(1)),
                new Rule("login-global", loginGlobal, Duration.ofMinutes(1)));
        return passwordWork.acquire();
    }

    /** 목적을 바꾸거나 이메일 별칭을 바꿔도 IP·전체 한도는 함께 적용한다. */
    public void email(String email, String clientAddress) {
        budgets.consume(new Rule("email-address:" + normalized(email), emailAddress, Duration.ofHours(1)),
                new Rule("email-ip:" + clientAddress, emailIp, Duration.ofHours(1)),
                new Rule("email-global", emailGlobal, Duration.ofHours(1)));
    }

    private String normalized(String value) { return value == null ? "" : value.strip().toLowerCase(Locale.ROOT); }

    // 새 키의 최대 생성량보다 빠르게 정리하되 한 번에 긴 삭제 트랜잭션을 만들지 않는다.
    @Scheduled(scheduler = "securityCleanupTaskScheduler", fixedDelay = 60000, initialDelay = 60000)
    public void cleanupBudgets() {
        for(int batch=0;batch<4;batch++) if(budgets.cleanup()<500) break;
    }
}
