package shop.esjh.memoryjar.enums.ai;

import org.springframework.http.HttpStatus;
import shop.esjh.memoryjar.config.exception.ErrorCode;

/** AI Draft API가 프론트에 제공하는 기능별 안정 오류 코드다. */
public enum AiDraftErrorCode implements ErrorCode {
    DRAFT_NOT_FOUND(HttpStatus.NOT_FOUND, "디자인 초안을 찾을 수 없습니다."),
    DRAFT_NOT_OWNER(HttpStatus.FORBIDDEN, "이 디자인 초안의 OWNER만 작업할 수 있습니다."),
    DRAFT_NOT_ACTIVE(HttpStatus.CONFLICT, "활성 상태가 아니거나 만료된 디자인 초안입니다."),
    DRAFT_ALREADY_FINALIZED(HttpStatus.CONFLICT, "이미 최종화된 디자인 초안입니다."),
    DRAFT_PROCESSING_FINALIZE_BLOCKED(HttpStatus.CONFLICT, "AI 생성이 진행 중인 디자인 초안은 최종화할 수 없습니다."),
    DRAFT_SELECTION_REQUIRED(HttpStatus.CONFLICT, "최종 디자인을 먼저 선택해야 합니다."),
    DRAFT_CUSTOM_SELECTION_REQUIRED(HttpStatus.CONFLICT, "ORIGINAL 또는 AI 디자인을 먼저 선택해야 Slot을 저장할 수 있습니다."),
    DRAFT_SLOT_REQUIRED(HttpStatus.CONFLICT, "커스텀 디자인의 Slot 위치와 크기를 먼저 저장해야 합니다."),
    DRAFT_SLOT_INVALID(HttpStatus.BAD_REQUEST, "Slot 값은 0과 1 사이의 소수점 다섯째 자리 이하 값이어야 합니다."),
    AI_GENERATION_ALREADY_PROCESSING(HttpStatus.CONFLICT, "이 디자인 초안에는 이미 진행 중인 AI 생성이 있습니다."),
    AI_GENERATION_NOT_FOUND(HttpStatus.NOT_FOUND, "AI 후보를 찾을 수 없습니다."),
    AI_GENERATION_NOT_SELECTABLE(HttpStatus.CONFLICT, "선택할 수 없는 AI 후보입니다."),
    AI_GENERATION_PREVIEW_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "AI 후보 미리보기를 준비하지 못했습니다. 잠시 후 다시 시도해주세요."),
    AI_GENERATION_SELECTION_REQUIRED(HttpStatus.CONFLICT, "선택한 AI 후보 정보가 없습니다."),
    AI_GENERATION_FINALIZE_NOT_SELECTABLE(HttpStatus.CONFLICT, "선택한 AI 후보는 더 이상 최종화할 수 없습니다."),
    FINALIZE_DEFAULT_SELECTION_REQUIRED(HttpStatus.CONFLICT, "DEFAULT 선택 상태의 Draft만 기본 저금통으로 최종화할 수 있습니다."),
    FINALIZE_CUSTOM_SELECTION_REQUIRED(HttpStatus.CONFLICT, "기본 저금통에는 영구 커스텀 이미지를 만들 수 없습니다."),
    FINALIZE_TARGET_CHANGED(HttpStatus.CONFLICT, "최종화 중 디자인 선택 또는 Slot이 변경되었습니다. 다시 시도해 주세요."),
    FINAL_IMAGE_COPY_FAILED(HttpStatus.BAD_GATEWAY, "최종 디자인 이미지를 준비하지 못했습니다."),
    DRAFT_SOURCE_IMAGE_REQUIRED(HttpStatus.BAD_REQUEST, "원본 이미지 파일이 필요합니다."),
    DRAFT_SOURCE_IMAGE_INVALID(HttpStatus.BAD_REQUEST, "손상되었거나 지원하지 않는 이미지입니다. PNG, JPEG, WebP 단일 프레임 이미지만 업로드할 수 있습니다."),
    DRAFT_SOURCE_IMAGE_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "원본 이미지는 10MB를 초과할 수 없습니다."),
    DRAFT_CONTENT_POLICY_REJECTED(HttpStatus.UNPROCESSABLE_ENTITY, "원본 이미지가 콘텐츠 정책을 통과하지 못했습니다."),
    DRAFT_MODERATION_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "원본 이미지 심사를 완료하지 못했습니다. 잠시 후 다시 시도해주세요."),
    DRAFT_SOURCE_UPLOAD_FAILED(HttpStatus.BAD_GATEWAY, "정규화된 원본 이미지를 안전하게 저장하지 못했습니다."),
    AI_PROVIDER_CONFIGURATION_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "Cloudflare AI 실행 설정이 준비되지 않았습니다.");
    private final HttpStatus status; private final String message;
    AiDraftErrorCode(HttpStatus status, String message) { this.status=status; this.message=message; }
    public String code(){ return name(); } public HttpStatus status(){ return status; } public String message(){ return message; }
}
