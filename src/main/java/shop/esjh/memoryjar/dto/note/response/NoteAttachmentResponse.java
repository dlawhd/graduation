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
    /** 저장소 주소 대신 매번 현재 멤버·공개 상태를 검사하는 주소를 전달한다. */
    public static NoteAttachmentResponse protectedResponse(shop.esjh.memoryjar.entity.note.NoteAttachment attachment) {
        return new NoteAttachmentResponse(attachment.getId(), attachment.getSortOrder(), attachment.getS3Key(),
                "/api/v1/files/attachments/" + attachment.getId() + "/content", null,
                attachment.getContentType(), attachment.getSize(), attachment.getCaption());
    }
}