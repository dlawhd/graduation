package shop.esjh.memoryjar.enums.file;

// 업로드가 지금 어떤 상태인지
public enum FileUploadStatus {
    PRESIGNED, // 업로드 티켓만 받은 상태
    COMPLETED, // S3 업로드 확인까지 끝난 상태
    CONSUMED,  // note 같은 실제 도메인에 이미 연결해서 다시 쓰면 안 되는 상태
    EXPIRED,   // 업로드 유효 기간과 완료 유예 시간이 지나 임시 파일을 정리한 상태
    UNUSED_DELETING, // 미사용 정리 작업이 확보한 파일. 새 쪽지에 연결하지 못한다.
    UNUSED_DELETED   // 실제 S3 삭제까지 확인한 미사용 파일
}
