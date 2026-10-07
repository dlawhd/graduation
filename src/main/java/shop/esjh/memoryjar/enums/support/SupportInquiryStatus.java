package shop.esjh.memoryjar.enums.support;

/** COPYING과 COPY_FAILED는 파일 보관 단계이며, 나머지 세 상태가 실제 문의 처리 단계다. */
public enum SupportInquiryStatus {
    COPYING, COPY_FAILED, OPEN, IN_PROGRESS, ANSWERED
}
