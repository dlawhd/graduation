package shop.esjh.memoryjar.dto.note.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/*
 * NoteAttachmentCreateRequest 역할
 *
 * 새 쪽지를 만들 때 첨부파일 한 개에 필요한 값을 받는 DTO야.
 *
 * s3Key:
 * - 어떤 S3 파일인지 찾는 내부 주소
 *
 * caption:
 * - 사용자가 사진/영상과 함께 적은 짧은 추억 설명
 */
public record NoteAttachmentCreateRequest(

        @NotBlank(message = "s3Key는 비어 있을 수 없어.")
        String s3Key,

        @Size(
                max = 200,
                message = "첨부 설명은 최대 200자까지 입력할 수 있어."
        )
        String caption

) {

        /*
         * 기존 테스트와 내부 코드에서
         *
         * new NoteAttachmentCreateRequest("s3Key")
         *
         * 형식을 계속 사용할 수 있게 해주는 편의 생성자야.
         *
         * caption을 생략하면 자동으로 null이 들어간다.
         */
        public NoteAttachmentCreateRequest(String s3Key) {
                this(s3Key, null);
        }
}