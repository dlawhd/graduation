package com.example.demo.service.file;

import com.example.demo.dto.file.request.FilePresignRequest;
import com.example.demo.dto.file.response.FilePresignResponse;
import org.springframework.stereotype.Service;

// presigned URL 생성 요청을 받아서 S3PresignService에게 실제 생성 맡기고 결과를 그대로 반환하는 역할
@Service
public class FileService {

    private final S3PresignService s3PresignService;

    public FileService(S3PresignService s3PresignService) {
        this.s3PresignService = s3PresignService;
    }

    // presigned URL 생성
    // 프론트 요청 → S3PresignService 호출 → 결과 반환
    public FilePresignResponse createPresignedUrl(FilePresignRequest request) {

        // 🔹 현재는 단순 위임 구조
        // 나중에 여기에서 purpose별 분기 로직 추가 가능
        // (예: NOTE, PROFILE, JAR에 따라 정책 다르게 적용)

        return s3PresignService.createPresignedUrl(request);
    }
}