import test from "node:test";
import assert from "node:assert/strict";
import { earlyDesignId, earlyDesignScope, earlyDesignSnapshot, hasEarlyDesign, EARLY_DESIGN_TTL } from "./earlyDesignDraftStore.mjs";
import { createEarlyDesignWriter } from "./earlyDesignWriter.mjs";
import { createDesignDraftPager } from "./designDraftPager.mjs";

const id = "de231565-0398-4289-8c0b-1d7ebf808f7f";
test("작업 번호와 계정이 모두 확인되어야 저장소 범위를 만든다", () => {
  assert.equal(earlyDesignId(id), id);
  assert.equal(earlyDesignId("../../other"), null);
  assert.equal(earlyDesignScope(null, id), null);
  assert.notEqual(earlyDesignScope(1, id), earlyDesignScope(2, id));
  assert.equal(EARLY_DESIGN_TTL, 7 * 24 * 3600 * 1000);
});
test("빈 진입은 초안이 아니지만 미완성 획과 2단계 진입은 저장한다", () => {
  assert.equal(hasEarlyDesign(earlyDesignSnapshot()), false);
  assert.equal(hasEarlyDesign(earlyDesignSnapshot({ bodyCanvas: "data:image/png;base64,YQ==", customBody: { points: [] } })), true);
  assert.equal(hasEarlyDesign(earlyDesignSnapshot({ imageOnly: true, step: 2 })), true);
});
test("저장 스냅샷은 원본과 PNG를 유지하고 외부 주소·임시 URL을 버린다", () => {
  const sourceImage = new Blob(["png"], { type: "image/png" });
  const snapshot = earlyDesignSnapshot({ sourceImage, previewUrl: "https://secret.invalid/a", imageCanvas: "blob:temporary", customBody: { points: [], artworkUrl: "https://other.invalid/a" } });
  assert.equal(snapshot.sourceImage, sourceImage);
  assert.equal(snapshot.imageCanvas, null);
  assert.equal(snapshot.previewUrl, undefined);
  assert.equal(snapshot.customBody.artworkUrl, undefined);
  assert.throws(() => earlyDesignSnapshot({ sourceImage: { size: 1 } }));
});
test("완료한 한 획의 좌표와 그림판 알림은 한 저장으로 합친다", async () => {
  const saves = [];
  const writer = createEarlyDesignWriter({ write: async (value, revision) => { saves.push(value); return revision + 1; } });
  writer.patch({ customBody: { points: [{ x: .2, y: .2 }], color: "#123456" } });
  writer.patch({ bodyCanvas: "data:image/png;base64,YQ==" });
  await writer.flush();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].bodyCanvas, "data:image/png;base64,YQ==");
});
test("저장 중 새 그림이 들어와도 동시 쓰기 없이 최신 그림까지 저장한다", async () => {
  let release, running = 0, maxRunning = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const saves = [];
  const writer = createEarlyDesignWriter({ write: async (value, revision) => {
    running++; maxRunning = Math.max(maxRunning, running);
    if (!saves.length) { saves.push(value); await gate; } else saves.push(value);
    running--; return revision + 1;
  } });
  writer.patch({ bodyStyle: "CAT" });
  await Promise.resolve();
  writer.patch({ bodyStyle: "HEART", step: 2 }); release();
  await writer.flush();
  assert.equal(maxRunning, 1);
  assert.equal(saves.at(-1).bodyStyle, "HEART");
  assert.equal(saves.at(-1).step, 2);
});
test("저장 공간 오류를 성공으로 알리지 않고 최신 상태로 재시도한다", async () => {
  let fail = true;
  const statuses = [];
  const writer = createEarlyDesignWriter({ write: async (_, revision) => { if (fail) throw new Error("quota"); return revision + 1; }, onStatus: value => statuses.push(value) });
  writer.patch({ bodyStyle: "CAT" });
  await assert.rejects(writer.flush(), /quota/);
  assert.equal(statuses.at(-1), "error");
  fail = false; await writer.retry();
  assert.equal(statuses.at(-1), "saved");
});
test("다른 탭과 충돌하면 이후 자동 저장과 서버 전환을 차단한다", async () => {
  let calls = 0;
  const writer = createEarlyDesignWriter({ write: async () => { calls++; throw Object.assign(new Error("conflict"), { code: "DRAFT_CONFLICT" }); } });
  writer.patch({ bodyStyle: "CAT" }); await assert.rejects(writer.flush());
  writer.patch({ bodyStyle: "HEART" }); await assert.rejects(writer.retry()); await assert.rejects(writer.finish(10));
  assert.equal(calls, 1);
});
test("서버 초안으로 전환한 뒤에는 늦은 그림판 알림이 작업을 되살리지 않는다", async () => {
  const saves = [];
  const writer = createEarlyDesignWriter({ write: async (_, revision, options) => { saves.push(options); return revision + 1; } });
  writer.patch({ bodyStyle: "CAT" }); await writer.finish(10);
  writer.patch({ bodyStyle: "HEART" }); await writer.flush();
  assert.equal(saves.length, 2);
  assert.deepEqual(saves.at(-1), { remove: true, serverDraftId: 10 });
});
test("처음 빈 화면은 저장하지 않고, 이미 저장한 그림 전체 지우기는 반영한다", async () => {
  const saves = [];
  const writer = createEarlyDesignWriter({ write: async (value, revision) => { saves.push(value); return revision + 1; } });
  writer.patch({ step: 1 }); await writer.flush(); assert.equal(saves.length, 0);
  writer.patch({ bodyCanvas: "data:image/png;base64,YQ==" }); await writer.flush();
  writer.patch({ bodyCanvas: null }); await writer.flush(); assert.equal(saves.at(-1).bodyCanvas, null);
});

const server = (draftId, updatedAt) => ({ draftId, updatedAt: new Date(updatedAt).toISOString() });
test("브라우저/서버 작업을 최신순으로 합쳐 모든 페이지에서 두 개씩 표시한다", async () => {
  const all = [server(4, 400), server(3, 300), server(2, 200), server(1, 100)];
  const local = [{ kind: "LOCAL", id, updatedAt: 350 }, { kind: "LOCAL", id: "another", updatedAt: 50 }];
  const requests = [];
  const pager = createDesignDraftPager({ readLocal: async () => local, listServer: async page => { requests.push(page); return { items: all.slice(page * 2, page * 2 + 2), hasNext: page === 0 }; } });
  assert.deepEqual((await pager.load(0)).items, [all[0], local[0]]);
  assert.deepEqual((await pager.load(1)).items, [all[1], all[2]]);
  const last = await pager.load(2);
  assert.deepEqual(last.items, [all[3], local[1]]); assert.equal(last.hasNext, false);
  await pager.load(0); assert.deepEqual(requests, [0, 1]);
});
test("서버 장애에도 브라우저 작업을 열 수 있고, 저장소 장애는 별도로 알린다", async () => {
  const local = [{ kind: "LOCAL", id, updatedAt: 100 }];
  let pager = createDesignDraftPager({ readLocal: async () => local, listServer: async () => { throw new Error("offline"); } });
  assert.deepEqual((await pager.load()).items, local);
  pager = createDesignDraftPager({ readLocal: async () => { throw new Error("blocked"); }, listServer: async () => ({ items: [server(1, 100)], hasNext: false }) });
  assert.equal((await pager.load()).items.length, 1);
  assert.ok((await pager.load()).warning);
});
test("목록 초기화 전에 시작한 요청은 새 페이지 캐시를 덮어쓰지 않는다", async () => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const pager = createDesignDraftPager({ readLocal: async () => [], listServer: () => response });
  const request = pager.load(); await Promise.resolve(); pager.reset(); release({ items: [server(1, 100)], hasNext: false });
  await assert.rejects(request);
});
