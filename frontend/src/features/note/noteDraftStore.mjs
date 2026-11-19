const DB_NAME = "memoryjar-private-note-drafts";
const DB_VERSION = 1;
let database;

/** 계정·저금통 번호가 모두 확인되기 전에는 저장소에 접근하지 않는다. */
export function noteDraftScope(userId, jarId) {
  const valid = value => /^[1-9]\d*$/.test(String(value));
  return valid(userId) && valid(jarId) ? `${userId}:${jarId}` : null;
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("이 브라우저에서는 초안 저장을 사용할 수 없어요."));
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("drafts");
      db.createObjectStore("files");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error("다른 탭을 닫고 초안을 다시 열어주세요.")); };
  });
  return database;
}

/** 미리보기·서명 URL은 저장하지 않고, 복구에 필요한 원본 파일만 별도 보관한다. */
export function draftSnapshot(form, attempt) {
  return {
    form: {
      title: form.title, content: form.content, noteDate: form.noteDate,
      location: form.location, tagsText: form.tagsText,
      attachments: (form.attachments || []).map(attachment => {
        const { clientId, s3Key, contentType, size, fileName, lastModified, caption, uploadedAt, pending } = attachment;
        return { clientId, s3Key, contentType, size, fileName, lastModified, caption, uploadedAt, pending };
      }),
    },
    // 저장 결과가 불확실한 제출도 같은 요청 번호·같은 첨부로 다시 확인한다.
    attempt: attempt?.id ? { key: attempt.key, id: attempt.id } : null,
  };
}

export function hasNoteDraft(form) {
  return Boolean(form && [form.title, form.content, form.noteDate, form.location, form.tagsText].some(value => String(value || "").length)
    || form?.attachments?.length);
}

/** 응답을 못 받은 원래 내용에만 같은 제출 번호를 복구한다. 새로 고른 파일은 새 작성 의도다. */
export function recoverableSubmission(attempt, payloadKey, attachments) {
  return attempt?.id && attempt.key === payloadKey && !attachments.some(item => item.pending)
    ? { key: attempt.key, id: attempt.id } : null;
}

export async function readNoteDraft(scope) {
  if (!scope) return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["drafts", "files"], "readonly");
    let draft = null;
    const request = tx.objectStore("drafts").get(scope);
    request.onsuccess = () => {
      if (!request.result) return;
      draft = request.result;
      draft.form.attachments.forEach(attachment => {
        const file = tx.objectStore("files").get(`${scope}/${attachment.clientId}`);
        file.onsuccess = () => { attachment.sourceFile = file.result; };
      });
    };
    tx.oncomplete = () => resolve(draft);
    tx.onabort = () => reject(tx.error || new Error("초안을 읽지 못했어요."));
    tx.onerror = () => {}; // onabort에서 한 번만 처리한다.
  });
}

/** 원자적 버전 확인으로 같은 저금통의 다른 탭이 저장한 초안을 덮어쓰지 않는다. */
export async function writeNoteDraft(scope, form, attempt, revision, writer, remove = false) {
  if (!scope) throw new Error("로그인 정보를 확인해 주세요.");
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["drafts", "files"], "readwrite");
    const drafts = tx.objectStore("drafts"), files = tx.objectStore("files");
    const request = drafts.get(scope);
    let conflict, nextRevision = revision;
    request.onsuccess = () => {
      const old = request.result;
      if ((old?.revision || 0) !== revision) {
        conflict = new Error("다른 탭에서 초안이 변경됐어요. 저장한 초안을 다시 불러와 주세요.");
        conflict.code = "DRAFT_CONFLICT";
        tx.abort(); return;
      }
      const attachments = remove ? [] : form.attachments || [];
      const nextIds = new Set(attachments.map(attachment => attachment.clientId));
      const oldIds = new Set((old?.form?.attachments || []).map(attachment => attachment.clientId));
      for (const id of oldIds) if (!nextIds.has(id)) files.delete(`${scope}/${id}`);
      if (remove) {
        // 버전의 무덤 표식을 남겨 오래 열린 다른 탭이 지운 초안을 되살리지 못하게 한다.
        nextRevision = (old?.revision || 0) + 1;
        drafts.put({ revision: nextRevision, writer, form: { attachments: [] }, cleared: true }, scope);
      } else {
        for (const attachment of attachments) if (attachment.sourceFile && !oldIds.has(attachment.clientId)) {
          files.put(attachment.sourceFile, `${scope}/${attachment.clientId}`);
        }
        nextRevision = (old?.revision || 0) + 1;
        drafts.put({ ...draftSnapshot(form, attempt), revision: nextRevision, writer, savedAt: Date.now() }, scope);
      }
    };
    tx.oncomplete = () => resolve(nextRevision);
    tx.onabort = () => reject(conflict || tx.error || new Error("초안 저장 공간을 확인해 주세요."));
    tx.onerror = () => {};
  });
}
