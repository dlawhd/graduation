package shop.esjh.memoryjar.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** 로그인 만료와 추가 인증 만료를 구분해 일반 사용자 로그인까지 지우지 않게 한다. */
public class OperatorMfaRequiredException extends ResponseStatusException {
    public OperatorMfaRequiredException() { super(HttpStatus.FORBIDDEN, "운영자 추가 인증이 필요합니다."); }
}
