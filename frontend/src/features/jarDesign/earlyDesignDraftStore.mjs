const DB_NAME = "memoryjar-early-design-drafts";
export const EARLY_DESIGN_TTL = 7 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let database;

export function earlyDesignId(value) { return typeof value === "string" && UUID.test(value) ? value : null; }
export function earlyDesignScope(userId, id) {
  return /^[1-9]\d*$/.test(String(userId)) && earlyDesignId(id) ? `${userId}:${id}` : null;
}

/** 완성되지 않은 획도 보관한다. Blob URL·외부 주소 대신 제한된 PNG와 선택 원본만 저장한다. */
export function earlyDesignSnapshot(value = {}) {
  const png = data => typeof data === "string" && data.length <= 1400000 && /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(data) ? data : null;
  const body = value.customBody;
  const file = value.sourceImage;
  if (file != null && (!(file instanceof Blob) || file.size > 10 * 1024 * 1024)) throw new Error("사진 원본의 크기를 확인해 주세요.");
  return {
    bodyStyle: typeof value.bodyStyle === "string" && /^[A-Z0-9_]{1,40}$/.test(value.bodyStyle) ? value.bodyStyle : null,
    customBody: body && typeof body === "object" ? {
      points: Array.isArray(body.points) ? body.points.slice(0, 96).map(point => ({ x: point.x, y: point.y })) : [],
      color: /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : "#d7e9df",
      ...(Array.isArray(body.photoContours) ? { photoContours: body.photoContours.slice(0, 8).map(points => points.slice(0, 96).map(point => ({ x: point.x, y: point.y }))) } : {}),
      ...(png(body.artworkUrl) ? { artworkUrl: png(body.artworkUrl) } : {}),
    } : null,
    bodyCanvas: png(value.bodyCanvas), imageCanvas: png(value.imageCanvas), sourceImage: file || null,
    sourceDirty: Boolean(value.sourceDirty), inputMode: value.inputMode === "UPLOAD" ? "UPLOAD" : "DRAW",
    imageOnly: Boolean(value.imageOnly), catalogOpen: Boolean(value.catalogOpen), step: value.step === 2 ? 2 : 1,
  };
}

export function hasEarlyDesign(value) {
  return Boolean(value.bodyStyle || value.imageOnly || value.bodyCanvas || value.imageCanvas || value.sourceImage || value.customBody?.points?.length);
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("이 브라우저에서는 초안 저장을 사용할 수 없어요."));
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const rows = request.result.createObjectStore("drafts", { keyPath: "scope" });
      rows.createIndex("owner", "owner");
      request.result.createObjectStore("payloads");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error("다른 탭을 닫고 다시 시도해 주세요.")); };
  });
  return database;
}

/** 목록은 작은 메타데이터만 읽는다. 사진과 그림판은 실제로 복구하거나 보이는 카드에서만 읽는다. */
export async function listEarlyDesignDrafts(userId, now = Date.now()) {
  if (!/^[1-9]\d*$/.test(String(userId))) return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["drafts", "payloads"], "readwrite"), items = [];
    const cursor = tx.objectStore("drafts").index("owner").openCursor(String(userId));
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return;
      const row = entry.value;
      if (!row.cleared && row.expiresAt <= now) {
        // 만료 후 늦은 저장이 작업을 되살리지 못하게 버전 표식은 남긴다.
        entry.update({ ...row, cleared: true, revision: row.revision + 1 });
        tx.objectStore("payloads").delete(row.scope);
      } else if (!row.cleared && row.hasContent) items.push({ ...row, kind: "LOCAL", draftId: `local:${row.id}` });
      entry.continue();
    };
    tx.oncomplete = () => resolve(items.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)));
    tx.onabort = () => reject(tx.error || new Error("초안 목록을 읽지 못했어요."));
    tx.onerror = () => {};
  });
}

export async function readEarlyDesignDraft(userId, id) {
  const scope = earlyDesignScope(userId, id);
  if (!scope) return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["drafts", "payloads"], "readonly");
    let row = null;
    const request = tx.objectStore("drafts").get(scope);
    request.onsuccess = () => {
      row = request.result || null;
      if (!row || row.cleared || row.expiresAt <= Date.now()) return;
      const payload = tx.objectStore("payloads").get(scope);
      payload.onsuccess = () => { row = { ...row, state: payload.result }; };
    };
    tx.oncomplete = () => resolve(row);
    tx.onabort = () => reject(tx.error || new Error("저장한 작업을 읽지 못했어요."));
    tx.onerror = () => {};
  });
}

/** 같은 계정·작업의 버전을 잠금 트랜잭션에서 비교한다. 삭제·서버 전환도 오래된 탭이 덮어쓰지 못한다. */
export async function writeEarlyDesignDraft(userId, id, value, revision, { remove = false, serverDraftId = null, now = Date.now() } = {}) {
  const scope = earlyDesignScope(userId, id);
  if (!scope) throw new Error("로그인 정보를 확인해 주세요.");
  const state = earlyDesignSnapshot(value);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["drafts", "payloads"], "readwrite"), rows = tx.objectStore("drafts");
    let failure, nextRevision;
    const request = rows.get(scope);
    request.onsuccess = () => {
      const old = request.result;
      if ((old?.revision || 0) !== revision || old?.cleared || old?.expiresAt <= now) {
        failure = new Error("다른 탭에서 작업이 변경되었거나 삭제·만료됐어요. 저장한 작업을 다시 열어주세요.");
        failure.code = "DRAFT_CONFLICT"; tx.abort(); return;
      }
      nextRevision = revision + 1;
      const cleared = remove;
      rows.put({ scope, id, owner: String(userId), revision: nextRevision, cleared, serverDraftId,
        createdAt: old?.createdAt || now, updatedAt: now, expiresAt: now + EARLY_DESIGN_TTL,
        hasContent: hasEarlyDesign(state), bodyStyle: state.bodyStyle || (state.customBody ? "CUSTOM" : null), step: state.step });
      if (cleared) tx.objectStore("payloads").delete(scope);
      else tx.objectStore("payloads").put(state, scope);
    };
    tx.oncomplete = () => resolve(nextRevision);
    tx.onabort = () => reject(failure || tx.error || new Error("초안을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요."));
    tx.onerror = () => {};
  });
}
