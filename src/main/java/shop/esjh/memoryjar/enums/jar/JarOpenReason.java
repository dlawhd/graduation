package shop.esjh.memoryjar.enums.jar;

// 왜 열렸는지 남기는 값이야.
public enum JarOpenReason {
    SCHEDULED,         // 스케줄러가 정시에 열어준 경우
    ACCESS_TRIGGERED   // 혹시 스케줄러가 못 했어도 사용자가 들어온 순간 열어줌
}