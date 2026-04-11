package com.example.demo.dto.file.request;

import com.example.demo.enums.file.FilePurpose;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

// 이 요청은 "내가 S3 업로드를 끝냈어. 서버가 확인해줘." 라고 말할 때 사용
public record FileCompleteRequest(

        @NotNull(message = "파일 목적은 필수야.")
        FilePurpose purpose,

        @NotBlank(message = "s3Key는 비어 있을 수 없어.")
        String s3Key
) {
}