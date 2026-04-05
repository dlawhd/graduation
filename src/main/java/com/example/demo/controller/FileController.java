package com.example.demo.controller;

import com.example.demo.dto.file.request.FilePresignRequest;
import com.example.demo.dto.file.response.FilePresignResponse;
import com.example.demo.service.file.FileService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/files")
public class FileController {

    private final FileService fileService;

    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    /**
     * presigned URL 생성 API
     *
     * 요청 예시:
     * {
     *   "purpose": "NOTE",
     *   "fileName": "photo.png",
     *   "contentType": "image/png",
     *   "size": 12345
     * }
     *
     * 응답 예시:
     * {
     *   "data": {
     *     "uploadUrl": "...",
     *     "s3Key": "...",
     *     "publicUrl": "...",
     *     "expiresAt": "..."
     *   }
     * }
     *
     * @Valid:
     * DTO에 적어둔 @NotNull, @NotBlank 같은 검증을 자동으로 실행해 줌
     */
    @PostMapping("/presign")
    public ResponseEntity<Map<String, FilePresignResponse>> createPresignedUrl(
            @Valid
            @RequestBody FilePresignRequest request
    ) {

        // 1. 서비스에게 presigned URL 생성 맡기기
        FilePresignResponse response = fileService.createPresignedUrl(request);

        // 2. 프로젝트 공통 응답 형식 { "data": ... } 으로 감싸서 반환
        return ResponseEntity.ok(Map.of("data", response));
    }
}