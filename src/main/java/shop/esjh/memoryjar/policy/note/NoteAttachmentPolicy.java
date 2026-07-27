package shop.esjh.memoryjar.policy.note;

/*
 * NoteAttachmentPolicy 역할
 *
 * 쪽지 첨부파일에 공통으로 적용되는 제한 숫자를
 * 한곳에서 관리하는 클래스야.
 *
 * DTO와 서비스가 서로 다른 최대 개수를 사용해서
 * 검증 기준이 어긋나는 일을 막아준다.
 */
public final class NoteAttachmentPolicy {

    // 사진과 영상을 합쳐 한 쪽지당 최대 10개까지 허용한다.
    public static final int MAX_ATTACHMENTS_PER_NOTE = 10;

    /*
     * 상수만 제공하는 클래스이므로
     * new NoteAttachmentPolicy()로 객체를 만들지 못하게 막는다.
     */
    private NoteAttachmentPolicy() {
    }
}