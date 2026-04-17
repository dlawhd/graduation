-- V19__alter_notifications_payload_constraints.sql

-- 이 마이그레이션은 notifications.payload_json 제약을 더 정확하게 바꾸는 역할
-- 기존 V18에서는 "빈 문자열만 아니면 됨" 수준이었다.
-- 이번 V19에서는
-- 1) payload_json이 진짜 JSON인지 검사하고
-- 2) 그 JSON이 우리가 기대하는 "객체(Object)" 형태인지까지 검사한다.
--
-- 예:
-- {"jarId":3,"noteId":15}  -> 통과
-- []                       -> 실패
-- "hello"                  -> 실패
-- abc                      -> 실패

ALTER TABLE notifications
    -- 기존 "길이만 0보다 크면 통과" 제약 제거
    DROP CONSTRAINT chk_notifications_payload_not_empty,

    -- 1) 진짜 JSON 문서인지 검사
    ADD CONSTRAINT chk_notifications_payload_json_valid
        CHECK (JSON_VALID(payload_json)),

    -- 2) JSON의 최상위 타입이 객체(Object)인지 검사
    --    알림 payload는 { ... } 형태로 저장할 거라서 OBJECT만 허용
    ADD CONSTRAINT chk_notifications_payload_json_object
        CHECK (JSON_TYPE(payload_json) = 'OBJECT');