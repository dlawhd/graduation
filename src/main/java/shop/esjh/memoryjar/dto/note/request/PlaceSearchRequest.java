package shop.esjh.memoryjar.dto.note.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 검색어만 받는다. 외부 URL이나 인증정보를 요청에서 받지 않아 임의 서버 호출을 막는다. */
public record PlaceSearchRequest(
        @NotBlank @Size(max = 100) @Pattern(regexp = "[^\\p{Cntrl}]*") String q) {
}
