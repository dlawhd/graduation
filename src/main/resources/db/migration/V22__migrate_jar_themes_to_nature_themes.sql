-- V22__migrate_jar_themes_to_nature_themes.sql
-- 기존 저금통 테마 값을 새 자연/계절 테마 값으로 바꿔주는 마이그레이션
--
-- 왜 필요할까?
-- 자바 enum을 SPRING, SUMMER 같은 새 값으로 바꾸면
-- DB에 남아 있는 COUPLE, FRIEND 같은 예전 값도 같이 정리해야 함.
-- DB 값과 자바 enum 값이 안 맞으면 저금통 조회할 때 에러가 날 수 있음.

-- 커플 추억 저금통 → 봄 테마
UPDATE jars
SET theme = 'SPRING'
WHERE theme = 'COUPLE';

-- 친구 우정 저금통 → 겨울 테마
UPDATE jars
SET theme = 'WINTER'
WHERE theme = 'FRIEND';

-- 가족 추억 저금통 → 여름 테마
UPDATE jars
SET theme = 'SUMMER'
WHERE theme = 'FAMILY';

-- 직접 만든 저금통 → 라벤더 테마
UPDATE jars
SET theme = 'LAVENDER'
WHERE theme = 'CUSTOM';
