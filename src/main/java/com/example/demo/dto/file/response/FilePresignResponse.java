package com.example.demo.dto.file.response;

import java.time.OffsetDateTime;

// 서버가 프론트에게 "이 주소로 업로드 해!" 라고 알려줄 때 사용
public record FilePresignResponse(

        // S3 업로드 URL (PUT 요청용)
        // 프론트는 이 URL로 파일을 직접 업로드함
        String uploadUrl,

        // S3 내부 경로
        String s3Key,

        // 업로드 후 접근 가능한 URL
        String publicUrl,

        // presigned URL 만료 시간
        OffsetDateTime expiresAt
) {
}