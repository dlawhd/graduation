package shop.esjh.memoryjar.dto.note.response;

/*
 * NoteAttachmentResponse 역할
 *
 * 저장된 사진/영상 정보를 프론트로 내려주는 DTO야.
 *
 * 이제 파일 주소뿐 아니라
 * 사용자가 작성한 추억 설명(caption)도 함께 내려준다.
 */
public record NoteAttachmentResponse(
        Long attachmentId,
        Integer sortOrder,
        String s3Key,
        String url,
        String thumbnailUrl,
        String contentType,
        Long size,

        // 사진/영상과 함께 보여줄 추억 설명
        String caption
) {
}