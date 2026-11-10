package shop.esjh.memoryjar.security;

import java.time.Instant;

/** HTTP 격리 시험에서 합성 등록 키의 번호만 만든다. 운영 클래스나 배포 JAR에는 포함되지 않는다. */
public final class OperatorMfaTestCodes {
    private OperatorMfaTestCodes() {}
    public static String current(String syntheticSecret) {
        return new OperatorMfaCrypto("", "").totp(syntheticSecret, Instant.now().getEpochSecond() / 30);
    }
}
