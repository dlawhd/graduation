import test from "node:test";
import assert from "node:assert/strict";
import { noteDraftScope, draftSnapshot, hasNoteDraft, recoverableSubmission } from "./noteDraftStore.mjs";

test("인증 전 저장하지 않고 계정과 저금통을 각각 분리한다", () => {
  assert.equal(noteDraftScope(null, 1), null);
  assert.equal(noteDraftScope("../1", 1), null);
  assert.equal(noteDraftScope(1, 2), "1:2");
  assert.notEqual(noteDraftScope(1, 2), noteDraftScope(2, 2));
  assert.notEqual(noteDraftScope(1, 2), noteDraftScope(1, 3));
});

test("제출 복구는 원래 본문·첨부가 같은 경우만 유지하고 새 파일 선택이나 수정은 구분한다", () => {
  const attempt = { key:"original-payload", id:"original-request" };
  assert.deepEqual(recoverableSubmission(attempt, "original-payload", [{pending:false}]), attempt);
  assert.deepEqual(recoverableSubmission(attempt, "original-payload", []), attempt);
  assert.equal(recoverableSubmission(attempt, "edited-payload", []), null);
  assert.equal(recoverableSubmission(attempt, "original-payload", [{pending:true}]), null);
  assert.equal(recoverableSubmission({key:null,id:null}, "original-payload", []), null);
});

test("초안 메타데이터에는 임시 URL·원본 파일을 섞지 않고 동일 제출 번호를 보존한다", () => {
  const snapshot = draftSnapshot({ title:"제목", content:"내용", noteDate:"2026-02-01", location:"서울", tagsText:"봄",
    attachments:[{ clientId:"file-1", s3Key:"notes/1/a", contentType:"image/png", size:3,
      caption:"사진", sourceFile:new Blob(["abc"]), previewUrl:"blob:private", url:"https://signed.invalid/secret", pending:false }],
  }, { key:"same-payload", id:"same-request" });
  assert.equal(snapshot.form.attachments[0].s3Key, "notes/1/a");
  assert.equal(snapshot.form.attachments[0].previewUrl, undefined);
  assert.equal(snapshot.form.attachments[0].sourceFile, undefined);
  assert.equal(snapshot.form.attachments[0].url, undefined);
  assert.deepEqual(snapshot.attempt, { key:"same-payload", id:"same-request" });
  assert.equal(hasNoteDraft(snapshot.form), true);
  assert.equal(hasNoteDraft({ attachments:[] }), false);
});
