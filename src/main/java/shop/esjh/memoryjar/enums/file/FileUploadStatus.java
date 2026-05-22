package shop.esjh.memoryjar.enums.file;

// 업로드가 지금 어떤 상태인지
public enum FileUploadStatus {
    PRESIGNED, // 업로드 티켓만 받은 상태
    COMPLETED, // S3 업로드 확인까지 끝난 상태
    CONSUMED   // note 같은 실제 도메인에 이미 연결해서 다시 쓰면 안 되는 상태
}