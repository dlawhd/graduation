package shop.esjh.memoryjar.dto.auth.response;

/** 비밀번호 복구 화면에 정규화한 아이디와 입력 형식 확인 결과를 반환한다. */
public record PasswordResetLoginIdCheckResponse(String loginId, boolean valid) {}
