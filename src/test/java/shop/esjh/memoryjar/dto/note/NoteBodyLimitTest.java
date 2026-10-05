package shop.esjh.memoryjar.dto.note;

import jakarta.validation.Validation;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import shop.esjh.memoryjar.dto.note.request.NoteCreateRequest;
import static org.assertj.core.api.Assertions.assertThat;

/** 새 쪽지의 서버 입력 제한이 300자 경계와 빈 본문을 정확히 검증하는지 확인한다. */
class NoteBodyLimitTest {
    @ParameterizedTest
    @ValueSource(ints = {0, 1, 300, 301, 10000})
    void validatesBodyBoundary(int length) {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var request = new NoteCreateRequest("제목", "가".repeat(length), null, null, null, null);
            var errors = factory.getValidator().validate(request);
            if (length >= 1 && length <= 300) assertThat(errors).isEmpty();
            else assertThat(errors).anySatisfy(error -> assertThat(error.getPropertyPath().toString()).isEqualTo("content"));
        }
    }
}
