package shop.esjh.memoryjar.dto.file.request;

import shop.esjh.memoryjar.enums.file.FilePurpose;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

// "파일 업로드 해도 돼?" 라고 물어볼 때 보내는 데이터
public record FilePresignRequest(

        // 파일 사용 목적
        @NotNull(message = "파일 목적은 필수")
        FilePurpose purpose,

        // 원본 파일 이름
        @NotBlank(message = "파일 이름은 비어 있을 수 없어.")
        String fileName,

        // 파일 타입
        @NotBlank(message = "contentType은 필수야.")
        String contentType,

        // 파일 크기
        @NotNull(message = "파일 크기는 필수야.")
        @Positive(message = "파일 크기는 0보다 커야 해.")
        Long size
) {
}