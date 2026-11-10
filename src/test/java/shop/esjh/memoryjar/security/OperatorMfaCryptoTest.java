package shop.esjh.memoryjar.security;

import java.time.Instant;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

/** RFC 기준값·시계 오차·재사용·암호문 변조를 검사한다. 시험 키는 실제 운영 설정과 관계없다. */
class OperatorMfaCryptoTest {
    private final OperatorMfaCrypto crypto = new OperatorMfaCrypto(Base64.getEncoder().encodeToString(new byte[32]), "test-only-bootstrap-not-a-real-credential");
    private final String rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    @Test void standardRfc6238VectorsWithSixDigits() {
        long[] times = {59, 1111111109, 1111111111, 1234567890, 2000000000L, 20000000000L};
        String[] codes = {"287082", "081804", "050471", "005924", "279037", "353130"};
        for (int i = 0; i < times.length; i++) assertThat(crypto.totp(rfcSecret, times[i] / 30)).isEqualTo(codes[i]);
    }
    @Test void acceptsOneStepSkewButRejectsReusedAndMalformedCode() {
        var now = Instant.ofEpochSecond(1234567890); long step = now.getEpochSecond() / 30;
        assertThat(crypto.matchingStep(rfcSecret, crypto.totp(rfcSecret, step - 1), now, -1)).isEqualTo(step - 1);
        assertThat(crypto.matchingStep(rfcSecret, crypto.totp(rfcSecret, step + 1), now, -1)).isEqualTo(step + 1);
        assertThat(crypto.matchingStep(rfcSecret, crypto.totp(rfcSecret, step), now, step)).isEqualTo(-1);
        assertThat(crypto.matchingStep(rfcSecret, " 12345", now, -1)).isEqualTo(-1);
        assertThat(crypto.matchingStep(rfcSecret, null, now, -1)).isEqualTo(-1);
    }
    @Test void encryptedSecretIsRandomizedAndBoundToUser() {
        String first = crypto.encrypt(1L, rfcSecret), second = crypto.encrypt(1L, rfcSecret);
        assertThat(first).isNotEqualTo(second).doesNotContain(rfcSecret);
        assertThat(crypto.decrypt(1L, first)).isEqualTo(rfcSecret);
        assertThatThrownBy(() -> crypto.decrypt(2L, first)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> crypto.decrypt(1L, first.substring(0, first.length() - 5) + "AAAAA"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
    @Test void generatedSecretsAndRecoveryCodesHaveExpectedEntropyAndFormat() {
        assertThat(crypto.newSecret()).matches("[A-Z2-7]{32}");
        var codes = crypto.newRecoveryCodes(); assertThat(codes).hasSize(10).doesNotHaveDuplicates();
        assertThat(codes).allMatch(code -> code.matches("[a-f0-9]{32}"));
        assertThat(crypto.matchesBootstrap("wrong")).isFalse();
        assertThat(crypto.matchesBootstrap("test-only-bootstrap-not-a-real-credential")).isTrue();
    }
    @Test void absentOrInvalidKeyNeverFallsBackToPlaintext() {
        var absent = new OperatorMfaCrypto("", ""); assertThat(absent.configured()).isFalse();
        assertThatThrownBy(() -> absent.encrypt(1L, rfcSecret)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> new OperatorMfaCrypto("bad", "")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OperatorMfaCrypto(Base64.getEncoder().encodeToString(new byte[32]), "short"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OperatorMfaCrypto(Base64.getEncoder().encodeToString(new byte[32]), "x".repeat(257)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
