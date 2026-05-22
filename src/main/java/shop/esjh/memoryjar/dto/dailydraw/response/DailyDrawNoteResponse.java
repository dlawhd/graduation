package shop.esjh.memoryjar.dto.dailydraw.response;

import shop.esjh.memoryjar.dto.note.response.NoteAttachmentResponse;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

// Daily Draw로 뽑힌 쪽지 정보를 화면에 내려주는 역할
public record DailyDrawNoteResponse(

        // 뽑힌 쪽지 번호
        Long noteId,

        // 이 쪽지가 들어있는 저금통 번호
        Long jarId,

        // 쪽지를 작성한 사용자 번호
        Long authorId,

        // 쪽지를 작성한 사용자 이름
        String authorName,

        // 쪽지 제목
        String title,

        // 쪽지 내용
        String content,

        // 암호화 여부
        // 현재는 일반 텍스트지만, 나중에 AES 암호화 확장 때 사용할 수 있다.
        boolean isEncrypted,

        // 실제 추억이 있었던 날짜
        LocalDate noteDate,

        // 추억 장소
        String location,

        // 쪽지 태그 목록
        List<String> tags,

        // 쪽지 첨부파일 목록
        // 기존 NoteAttachmentResponse를 재사용해서 이미지/영상 표시 구조를 맞춘다.
        List<NoteAttachmentResponse> attachments,

        // 쪽지 작성 시간
        OffsetDateTime createdAt,

        // 쪽지 수정 시간
        OffsetDateTime updatedAt
) {
}