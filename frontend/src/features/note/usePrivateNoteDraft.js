import { useEffect, useRef, useState } from "react";
import { hasNoteDraft, noteDraftScope, readNoteDraft, writeNoteDraft, recoverableSubmission } from "./noteDraftStore.mjs";
import fileApi from "../../api/fileApi";

/** 같은 브라우저에서 계정·저금통별 비공개 쪽지와 첨부를 복구한다. 서버에 작성 여부를 보내지 않는다. */
export function usePrivateNoteDraft({ userId, jarId, form, setForm, attempt, getAttemptKey }) {
  const scope = noteDraftScope(userId, jarId);
  const [saved, setSaved] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const context = useRef(null);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    const ctx = { scope, active: true, editing: false, revision: 0, writer: crypto.randomUUID(), queue: Promise.resolve(), staged: new Map(), blocked: false };
    context.current = ctx;
    setSaved(null); setStatus("loading"); setError(""); setPendingCount(0);
    if (!scope) { setStatus("unavailable"); return () => { ctx.active = false; }; }
    readNoteDraft(scope).then(record => {
      if (!ctx.active) return;
      ctx.revision = record?.revision || 0;
      if (record && !record.cleared && hasNoteDraft(record.form)) { setSaved(record); setStatus("available"); }
      else { ctx.editing = true; setStatus("ready"); }
    }).catch(() => {
      if (ctx.active) { ctx.blocked = true; setStatus("unavailable"); setError("초안을 읽지 못했어요. 브라우저 저장 공간을 확인해 주세요. 저장한 초안을 다시 불러온 뒤 이어서 작성해 주세요."); }
    });
    return () => {
      ctx.active = false;
      formRef.current.attachments.forEach(item => { if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl); });
    };
  }, [scope]);

  function mergedForm(ctx, value) {
    const ids = new Set(value.attachments.map(item => item.clientId));
    for (const id of ids) ctx.staged.delete(id);
    return { ...value, attachments: [...value.attachments, ...ctx.staged.values()] };
  }

  // 같은 탭의 빠른 입력·첨부 완료·제출·삭제도 저장 순서를 지켜 이전 입력이 되살아나지 않게 한다.
  function persist(value = formRef.current, { remove = false, required = false } = {}) {
    const ctx = context.current;
    if (!ctx?.scope || ctx.blocked || !ctx.editing) {
      return required && ctx?.blocked ? Promise.reject(new Error(error || "초안 저장을 확인해 주세요.")) : Promise.resolve();
    }
    const snapshot = mergedForm(ctx, value);
    // 제출 실패 뒤 본문·사진 순서·설명을 바꾼 초안에는 이전 제출 번호를 붙이지 않는다.
    // 그래야 오래된 미사용 첨부를 복구할 때도 실제로 불확실한 제출만 원래 키를 유지한다.
    const savedAttempt = recoverableSubmission(attempt.current, getAttemptKey(snapshot), snapshot.attachments);
    const operation = ctx.queue.then(async () => {
      if (ctx.blocked) throw new Error("초안 저장을 확인해 주세요.");
      ctx.revision = await writeNoteDraft(ctx.scope, snapshot, savedAttempt, ctx.revision, ctx.writer, remove);
      if (ctx.active) { setStatus(remove ? "ready" : "saved"); setError(""); }
    });
    ctx.queue = operation.catch(failure => {
      if (failure.code === "DRAFT_CONFLICT") ctx.blocked = true;
      if (ctx.active) { setStatus("error"); setError(failure.message || "초안을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요."); }
    });
    return required ? operation : ctx.queue;
  }

  useEffect(() => {
    const ctx = context.current;
    if (ctx?.editing) void persist(form, { remove: !hasNoteDraft(form) && !ctx.staged.size });
  }, [form]);

  async function resume(record = saved) {
    const ctx = context.current;
    if (!ctx || !record || status === "restoring" || ctx.restoring) return;
    ctx.restoring = true;
    setStatus("restoring"); setError("");
    const urls = [];
    try {
      const restored = { ...record.form, attachments: [] };
      // 완료 후 7일 미사용 파일 정리보다 하루 앞서 원본으로 재업로드한다.
      // 불확실한 제출은 원래 파일 키로 먼저 재시도해야 서버의 중복 생성 방지와 일치한다.
      for (const attachment of record.form.attachments) {
        if (!ctx.active) { urls.forEach(url => URL.revokeObjectURL(url)); return; }
        let next = { ...attachment };
        const expired = !next.uploadedAt || Date.now() - next.uploadedAt > 6 * 24 * 60 * 60 * 1000;
        if ((next.pending || expired) && !record.attempt?.id) {
          if (!next.sourceFile) throw new Error("첨부 원본을 찾지 못했어요. 초안을 지우기 전에 내용을 확인해 주세요.");
          const file = next.sourceFile;
          const presign = await fileApi.presignNoteFile({ fileName: next.fileName, contentType: next.contentType, size: file.size });
          if (!ctx.active) { urls.forEach(url => URL.revokeObjectURL(url)); return; }
          await fileApi.uploadFileToS3(presign.uploadUrl, file, next.contentType);
          if (!ctx.active) { urls.forEach(url => URL.revokeObjectURL(url)); return; }
          await fileApi.completeNoteFile({ s3Key: presign.s3Key });
          if (!ctx.active) { urls.forEach(url => URL.revokeObjectURL(url)); return; }
          next = { ...next, ...fileApi.toNoteAttachmentPayload(presign, file), uploadedAt: Date.now(), pending: false };
        }
        if (next.sourceFile) { next.previewUrl = URL.createObjectURL(next.sourceFile); urls.push(next.previewUrl); }
        restored.attachments.push(next);
      }
      if (!ctx.active) { urls.forEach(url => URL.revokeObjectURL(url)); return; }
      attempt.current = record.attempt || { key: null, id: null };
      ctx.staged.clear(); setPendingCount(0);
      ctx.editing = true;
      formRef.current.attachments.forEach(item => { if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl); });
      setForm(restored); setSaved(null); setStatus("saved");
      await persist(restored);
    } catch (failure) {
      urls.forEach(url => URL.revokeObjectURL(url));
      if (ctx.active) { setStatus("available"); setError(failure?.response?.data?.error?.message || failure.message || "초안을 복구하지 못했어요. 다시 시도해 주세요."); }
    } finally { ctx.restoring = false; }
  }

  async function discard(emptyForm) {
    const ctx = context.current;
    if (!ctx || status === "restoring" || ctx.restoring) return;
    ctx.editing = true; ctx.staged.clear();
    try {
      await persist(emptyForm, { remove: true, required: true });
      if (!ctx.active) return;
      formRef.current.attachments.forEach(item => { if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl); });
      attempt.current = { key: null, id: null };
      setForm(emptyForm); setSaved(null); setPendingCount(0); setStatus("ready");
    } catch { /* persist가 저장 실패를 안내한다. 기존 내용은 유지한다. */ }
  }

  function stage(files) {
    const ctx = context.current;
    if (!ctx) return;
    for (const file of files) ctx.staged.set(file.clientId, file);
    setPendingCount([...ctx.staged.values()].filter(item => item.pending).length);
    return persist();
  }
  function complete(attachment) {
    const ctx = context.current;
    if (ctx?.staged.has(attachment.clientId)) ctx.staged.set(attachment.clientId, attachment);
    setPendingCount([...ctx.staged.values()].filter(item => item.pending).length);
    return persist();
  }
  async function recoverPending() {
    const ctx = context.current;
    await ctx.queue;
    // 저장 공간 부족으로 마지막 쓰기가 실패했어도 현재 메모리의 원본은 버리지 않는다.
    if (ctx.active) {
      const value = mergedForm(ctx, formRef.current);
      await resume({ form: value, attempt: recoverableSubmission(attempt.current, getAttemptKey(value), value.attachments) });
    }
  }
  async function reload() {
    const ctx = context.current;
    if (!ctx?.scope) return;
    await ctx.queue;
    try {
      const record = await readNoteDraft(ctx.scope);
      if (!ctx.active) return;
      ctx.revision = record?.revision || 0; ctx.blocked = false; ctx.staged.clear(); setPendingCount(0);
      setSaved(record && !record.cleared ? record : null);
      ctx.editing = Boolean(!record || record.cleared);
      // 다른 탭에서 완료·폐기한 초안을 다시 불러오면 오래된 입력을 새 쪽지로 재제출하지 않게 비운다.
      if (record?.cleared) {
        formRef.current.attachments.forEach(item => { if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl); });
        attempt.current = { key: null, id: null };
        setForm({ title: "", content: "", noteDate: "", location: "", tagsText: "", attachments: [] });
      }
      setStatus(ctx.editing ? "ready" : "available"); setError("");
    } catch (failure) { if (ctx.active) setError(failure.message); }
  }
  return { status, error, pendingCount, available: Boolean(saved), resume, discard, persist, stage, complete, recoverPending, reload,
    blocked: status === "loading" || status === "restoring" || Boolean(saved) || pendingCount > 0 || Boolean(context.current?.blocked) };
}
