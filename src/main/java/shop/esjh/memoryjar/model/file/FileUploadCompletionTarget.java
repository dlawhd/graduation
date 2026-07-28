package shop.esjh.memoryjar.model.file;

/*
 * FileUploadCompletionTarget 역할
 *
 * DB에서 확인한 업로드 정보 중
 * 실제 S3 파일 검사에 필요한 값만 담는 내부 값 객체다.
 *
 * API 요청이나 응답으로 외부에 노출되는 DTO가 아니며,
 * FileUpload Entity를 트랜잭션 밖으로 직접 전달하지 않기 위해 사용한다.
 */
public record FileUploadCompletionTarget(

        // file_uploads 테이블의 업로드 기록 ID
        Long uploadId,

        // S3에서 실제 파일을 찾을 때 사용하는 경로
        String s3Key,

        // Presigned URL 발급 당시 요청한 파일 타입
        String contentType,

        // Presigned URL 발급 당시 요청한 파일 크기
        Long size
) {
}
