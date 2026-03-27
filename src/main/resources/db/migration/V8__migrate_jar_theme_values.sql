-- 기존 BASIC / SPRING 값을
-- 새 enum 값인 COUPLE / FRIEND / FAMILY / CUSTOM 으로 옮겨주는 마이그레이션

-- 왜 이런 작업이 필요하냐?
-- 지금 DB에는 BASIC, SPRING 값이 이미 저장돼 있을 수 있는데,
-- enum을 바꾸면 예전 값과 새 코드가 서로 안 맞게 되기 때문이야.

-- 1) 커플 템플릿으로 만들어진 기존 데이터
-- 현재 프론트 기준:
-- SPRING + 2명 + 한 번에 공개 + 제목만 공개
UPDATE jars
SET theme = 'COUPLE'
WHERE theme = 'SPRING'
  AND max_members = 2
  AND open_mode = 'ALL_AT_ONCE'
  AND lock_level = 'TITLE_ONLY';

-- 2) 친구 템플릿으로 만들어진 기존 데이터
-- 현재 프론트 기준:
-- BASIC + 4명 + 하루 1장 랜덤 + 메타만 공개
UPDATE jars
SET theme = 'FRIEND'
WHERE theme = 'BASIC'
  AND max_members = 4
  AND open_mode = 'DAILY_DRAW'
  AND lock_level = 'META_ONLY';

-- 3) 가족 템플릿으로 만들어진 기존 데이터
-- 현재 프론트 기준:
-- SPRING + 5명 + 한 번에 공개 + 완전 비밀
UPDATE jars
SET theme = 'FAMILY'
WHERE theme = 'SPRING'
  AND max_members = 5
  AND open_mode = 'ALL_AT_ONCE'
  AND lock_level = 'HIDDEN';

-- 4) 위 규칙에 정확히 걸리지 않은 예전 BASIC / SPRING 데이터는
-- 가장 무난하게 CUSTOM 으로 정리해줘.
UPDATE jars
SET theme = 'CUSTOM'
WHERE theme IN ('BASIC', 'SPRING');

-- 5) 앞으로 새 row 기본값도 CUSTOM 으로 맞춰줘.
ALTER TABLE jars
    MODIFY COLUMN theme VARCHAR(30) NOT NULL DEFAULT 'CUSTOM';