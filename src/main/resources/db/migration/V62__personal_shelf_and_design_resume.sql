-- 기존 멤버에는 즐겨찾기 기본값 false를 적용한다.
ALTER TABLE jar_members ADD COLUMN favorite BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_member_personal_shelf ON jar_members(user_id, deleted_at, favorite, jar_id);
CREATE INDEX idx_draft_owner_resume ON jar_design_drafts(owner_id, status, updated_at, draft_id);
