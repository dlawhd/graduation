package shop.esjh.memoryjar.dto.ai.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.AssertTrue;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;

/** 본체와 사진 배치를 원자적으로 저장한다. bodyStyle=null은 기본 테마가 아닌 '이미지만 사용'이다. */
public record JarDesignCompositionRequest(JarBodyStyle bodyStyle, @Valid JarPhotoFrameValue photoFrame,
        @NotNull JarDraftDesignType expectedDesignType, Long expectedGenerationId,
        JarBodyStyle expectedBodyStyle, @Valid JarPhotoFrameValue expectedPhotoFrame) {
    @AssertTrue(message="저금통 모양과 사진 배치를 함께 지정하거나 모두 비워주세요.")
    public boolean isCompositionConsistent() { return (bodyStyle == null) == (photoFrame == null); }
}
