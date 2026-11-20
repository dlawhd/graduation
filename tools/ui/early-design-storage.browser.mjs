import { earlyDesignScope, readEarlyDesignDraft, writeEarlyDesignDraft, listEarlyDesignDrafts, EARLY_DESIGN_TTL } from "/test-source/earlyDesignDraftStore.mjs";

// 전용 시험 계정과 매번 다른 작업 번호만 사용한다. 실제 사용자 초안에는 접근하지 않는다.
const owner = 999999999, output = document.querySelector("#results");
document.querySelector("#run").addEventListener("click", async event => {
  event.target.disabled = true;
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const lines = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); lines.push(`PASS ${label}`); };
  try {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 480;
    const context = canvas.getContext("2d"); context.fillStyle = "#00aa55"; context.fillRect(25, 25, 200, 100);
    const png = canvas.toDataURL("image/png");
    const state = { bodyCanvas: png, customBody: { points: [], color: "#00aa55" }, step: 1 };
    check(await readEarlyDesignDraft(owner, ids[0]) === null, "새 작업은 비어 있음");
    let revision = await writeEarlyDesignDraft(owner, ids[0], state, 0);
    let record = await readEarlyDesignDraft(owner, ids[0]);
    check(record.state.bodyCanvas === png && record.state.step === 1, "미완성 틀의 원본 픽셀 저장·복구");
    state.imageCanvas = png; state.sourceDirty = true; state.step = 2;
    state.sourceImage = new File(["original bytes"], "photo.png", { type: "image/png" });
    revision = await writeEarlyDesignDraft(owner, ids[0], state, revision);
    record = await readEarlyDesignDraft(owner, ids[0]);
    check(record.state.step === 2 && record.state.sourceDirty && record.state.imageCanvas === png, "2단계 미확정 그림 보존");
    check(await record.state.sourceImage.text() === "original bytes", "선택한 사진 원본 바이트 복구");
    check(await readEarlyDesignDraft(owner - 1, ids[0]) === null && earlyDesignScope(owner, ids[0]) !== earlyDesignScope(owner - 1, ids[0]), "계정별 격리");
    await writeEarlyDesignDraft(owner, ids[1], { bodyStyle: "CAT" }, 0);
    check((await readEarlyDesignDraft(owner, ids[1])).state.bodyStyle === "CAT" && !(await readEarlyDesignDraft(owner, ids[0])).state.bodyStyle, "작업 번호별 격리");
    const rows = await listEarlyDesignDrafts(owner);
    check(rows.length === 2 && rows.every(row => !row.state && !row.sourceImage && !row.bodyCanvas), "목록은 파일 없는 메타데이터만 조회");
    const competing = await Promise.allSettled([writeEarlyDesignDraft(owner, ids[0], state, revision), writeEarlyDesignDraft(owner, ids[0], state, revision)]);
    check(competing.filter(result => result.status === "fulfilled").length === 1 && competing.find(result => result.status === "rejected").reason.code === "DRAFT_CONFLICT", "동시 저장은 한 탭만 성공");
    record = await readEarlyDesignDraft(owner, ids[0]);
    revision = await writeEarlyDesignDraft(owner, ids[0], {}, record.revision);
    check(!(await listEarlyDesignDrafts(owner)).some(row => row.id === ids[0]), "그림 전체 지우기 후 빈 작업 숨김");
    revision = await writeEarlyDesignDraft(owner, ids[0], state, revision);
    await writeEarlyDesignDraft(owner, ids[0], {}, revision, { remove: true });
    let conflict = false;
    try { await writeEarlyDesignDraft(owner, ids[0], state, revision); } catch (error) { conflict = error.code === "DRAFT_CONFLICT"; }
    check(conflict && (await readEarlyDesignDraft(owner, ids[0])).cleared, "삭제 후 오래된 탭의 작업 부활 차단");
    revision = await writeEarlyDesignDraft(owner, ids[2], state, 0);
    await writeEarlyDesignDraft(owner, ids[2], state, revision, { remove: true, serverDraftId: 123 });
    record = await readEarlyDesignDraft(owner, ids[2]);
    check(record.cleared && record.serverDraftId === 123 && !record.state, "서버 전환 후 브라우저 원본 정리·서버 번호 보존");
    await writeEarlyDesignDraft(owner, ids[3], state, 0, { now: Date.now() - EARLY_DESIGN_TTL - 1000 });
    await listEarlyDesignDrafts(owner);
    check((await readEarlyDesignDraft(owner, ids[3])).cleared, "7일 만료 작업의 원본 정리");
    output.textContent = `${lines.join("\n")}\n전체 ${lines.length}개 통과`;
    document.title = `PASS ${lines.length} · 초기 제작 저장 검증`;
  } catch (error) {
    output.textContent = `${lines.join("\n")}\nFAIL ${error.stack || error.message}`;
    document.title = "FAIL · 초기 제작 저장 검증";
  } finally {
    for (const id of ids) {
      const record = await readEarlyDesignDraft(owner, id);
      if (record && !record.cleared) await writeEarlyDesignDraft(owner, id, {}, record.revision, { remove: true });
    }
    event.target.disabled = false;
  }
});
