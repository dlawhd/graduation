// 로컬 HTTP 검증 페이지에서 실제 브라우저 IndexedDB 구현으로 실행하는 회귀 검사다.
// /test-source/noteDraftStore.mjs는 수정한 원본 모듈을 그대로 제공해야 한다.
import { readNoteDraft, writeNoteDraft, noteDraftScope } from "/test-source/noteDraftStore.mjs";

const output = document.querySelector("#results");
const check = (condition, message) => { if (!condition) throw new Error(message); };
document.querySelector("#run").addEventListener("click", async event => {
  event.target.disabled = true;
  output.textContent = "검증 중";
  const lines = [];
  const scope = noteDraftScope(999999999, Date.now());
  let revision = 0;
  const form = { title:"복구 제목", content:"복구 내용", noteDate:"2026-02-01", location:"로컬", tagsText:"봄", attachments:[] };
  try {
    check(await readNoteDraft(scope) === null, "새 초안은 비어 있어야 한다");
    form.attachments.push({ clientId:"test-file", fileName:"original.png", contentType:"image/png", size:3, caption:"원본", sourceFile:new File(["abc"], "original.png", { type:"image/png" }), pending:true });
    revision = await writeNoteDraft(scope, form, { id:"same-request", key:"same-payload" }, revision, "tab-a");
    let stored = await readNoteDraft(scope);
    check(stored.form.title === form.title && stored.form.noteDate === form.noteDate, "글·추억 날짜 복구"); lines.push("PASS 글·날짜 저장과 복구");
    check(await stored.form.attachments[0].sourceFile.text() === "abc", "선택한 파일 바이트 복구"); lines.push("PASS 업로드 전 원본 파일 복구");
    check(stored.attempt.id === "same-request", "재시도 요청 번호 보존"); lines.push("PASS 응답 유실 후 동일 제출 번호 유지");
    check(await readNoteDraft(noteDraftScope(999999998, scope.split(":")[1])) === null, "다른 계정 격리"); lines.push("PASS 계정별 격리");
    check(await readNoteDraft(noteDraftScope(999999999, Number(scope.split(":")[1])+1)) === null, "다른 저금통 격리"); lines.push("PASS 저금통별 격리");
    form.attachments[0].caption = "수정 설명";
    revision = await writeNoteDraft(scope, form, stored.attempt, revision, "tab-a");
    stored = await readNoteDraft(scope);
    check(stored.form.attachments[0].caption === "수정 설명" && await stored.form.attachments[0].sourceFile.text() === "abc", "메타데이터 변경 중 원본 보존"); lines.push("PASS 반복 저장 시 첨부 원본 보존");
    const competing = await Promise.allSettled([
      writeNoteDraft(scope, {...form, title:"첫 탭"}, null, revision, "tab-a"),
      writeNoteDraft(scope, {...form, title:"두 번째 탭"}, null, revision, "tab-b"),
    ]);
    check(competing.filter(item => item.status === "fulfilled").length === 1, "동시 저장은 한 요청만 성공해야 한다");
    check(competing.find(item => item.status === "rejected").reason.code === "DRAFT_CONFLICT", "충돌은 명시적으로 안내해야 한다");
    lines.push("PASS 다중 탭 동시 저장 충돌 보호");
    stored = await readNoteDraft(scope); revision = stored.revision;
    form.attachments = [];
    revision = await writeNoteDraft(scope, form, null, revision, "tab-a");
    check((await readNoteDraft(scope)).form.attachments.length === 0, "첨부 제거 반영"); lines.push("PASS 첨부 제거 후 복구 목록 갱신");
    const oldRevision = revision;
    revision = await writeNoteDraft(scope, form, null, revision, "tab-a", true);
    check((await readNoteDraft(scope)).cleared, "성공·폐기 후 초안 정리"); lines.push("PASS 완료·폐기 초안 정리");
    let rejected = false;
    try { await writeNoteDraft(scope, form, null, oldRevision, "tab-b"); } catch (error) { rejected = error.code === "DRAFT_CONFLICT"; }
    check(rejected, "오래된 탭이 삭제한 초안을 되살리면 안 된다"); lines.push("PASS 삭제 후 오래된 탭의 초안 부활 차단");
    output.textContent = lines.join("\n") + `\n전체 ${lines.length}개 통과`;
    document.title = `PASS ${lines.length} · 초안 저장 검증`;
  } catch (error) {
    output.textContent = lines.join("\n") + "\nFAIL " + error.message;
    document.title = "FAIL · 초안 저장 검증";
  } finally { event.target.disabled = false; }
});
