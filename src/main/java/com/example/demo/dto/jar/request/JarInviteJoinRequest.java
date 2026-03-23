package com.example.demo.dto.jar.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// 초대코드로 저금통에 들어갈 때 보내는 요청
// 이 초대장 번호로 들어갈게!
public record JarInviteJoinRequest(

        // 초대코드는 비어 있으면 안 되고 너무 짧거나 너무 길어도 안 됌
        @NotBlank
        @Size(min = 4, max = 20)
        String code
) {
}