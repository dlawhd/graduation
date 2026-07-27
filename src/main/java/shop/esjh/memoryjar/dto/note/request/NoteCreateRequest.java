package shop.esjh.memoryjar.dto.note.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import shop.esjh.memoryjar.policy.note.NoteAttachmentPolicy;

import java.time.LocalDate;
import java.util.List;

// 쪽지를 새로 만들 때 프론트가 보내는 요청값
public record NoteCreateRequest(

        // 제목은 필수
        @NotBlank
        @Size(max = 100)
        String title,

        // 내용도 필수
        @NotBlank
        String content,

        // 추억 날짜는 선택
        LocalDate noteDate,

        // 장소도 선택
        @Size(max = 100)
        String location,

        // 첨부 파일은 선택 값이다.
        // 프론트 검증을 우회하더라도 서버 요청 단계에서 최대 10개로 막는다.
        @Valid
        @Size(
                max = NoteAttachmentPolicy.MAX_ATTACHMENTS_PER_NOTE,
                message = "첨부파일은 최대 10개까지 넣을 수 있어."
        )
        List<NoteAttachmentCreateRequest> attachments,

        // 태그도 선택
        // 예: ["여행", "봄", "웃음"]
        @Size(max = 10)
        List<@NotBlank @Size(max = 30) String> tags
) {
}