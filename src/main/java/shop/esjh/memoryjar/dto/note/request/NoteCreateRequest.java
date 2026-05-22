package shop.esjh.memoryjar.dto.note.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

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

        // 첨부 파일도 선택
        @Valid
        List<NoteAttachmentCreateRequest> attachments,

        // 태그도 선택
        // 예: ["여행", "봄", "웃음"]
        @Size(max = 10)
        List<@NotBlank @Size(max = 30) String> tags
) {
}