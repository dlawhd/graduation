package shop.esjh.memoryjar.isolated;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import shop.esjh.memoryjar.config.PasswordEncoderConfig;

/** Spring 서버·DB·외부 SDK를 시작하지 않고 표준 입력의 시험 비밀번호만 기존 설정으로 해시한다. */
public final class ReadFixturePasswords {
    public static void main(String[] args) throws Exception {
        var json = new ObjectMapper();
        var input = json.readTree(System.in);
        if (!input.isArray() || input.size() != 10) throw new IllegalArgumentException("Ten test passwords required");
        var encoder = new PasswordEncoderConfig().passwordEncoder();
        List<String> hashes = new ArrayList<>();
        for (var item : input) {
            if (!item.isTextual() || !item.asText().matches("Lt!7[a-f0-9]{32}")) {
                throw new IllegalArgumentException("Generated test password required");
            }
            hashes.add(encoder.encode(item.asText()));
        }
        // 호출한 도구가 파이프로만 받는다. 운영 비밀번호·JWT·AWS 설정은 읽지 않는다.
        System.out.print("READ_FIXTURE_HASHES=" + json.writeValueAsString(hashes));
    }
}
