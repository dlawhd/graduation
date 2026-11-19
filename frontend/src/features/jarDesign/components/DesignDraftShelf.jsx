import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { deleteJarDesignDraft, getJarDesignOriginalPreview, getJarDesignGenerationPreview, listJarDesignDrafts } from "../../../api/jarDesignDraftApi";
import { useRequestGate } from "../../../api/useRequestGate";
import { readDesignResume, writeDesignResume } from "../designResume.mjs";
import { DESIGN_STEPS, resumableDesignStep } from "../designWorkflow.mjs";
import { storedSlot } from "../slotGeometry.mjs";
import { toCutoutMaskStyle } from "../cutoutGeometry.mjs";
import { getJarBody } from "../jarBodies.mjs";
import { coverPhotoFrame, WHOLE_PHOTO } from "../photoFraming.mjs";
import JarDesignImage from "./JarDesignImage";

const actionClass = "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-bold disabled:opacity-40";
const pageButtonClass = "inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-40";
const timeLabel = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "확인할 수 없어요";

/** 화면에 보이는 두 작업만 소유자 전용 이미지 주소를 발급받는다. 주소는 저장소에 남기지 않는다. */
function DraftCard({ row, userId, busy, onDelete }) {
  const [preview, setPreview] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const draft = row.design;
  useEffect(() => {
    let current = true;
    setPreview(null); setImageError(false);
    const request = draft?.selectedDesignType === "AI" && draft.selectedGenerationId
      ? getJarDesignGenerationPreview(row.draftId, draft.selectedGenerationId)
      : getJarDesignOriginalPreview(row.draftId);
    request.then(result => { if (current) setPreview(result); })
      .catch(() => { if (current) setImageError(true); });
    return () => { current = false; };
  }, [row.draftId, draft?.selectedDesignType, draft?.selectedGenerationId, userId, retry]);
  const step = resumableDesignStep(draft, readDesignResume(userId, row.draftId, "selection"), readDesignResume(userId, row.draftId, "step"));
  const form = readDesignResume(userId, row.draftId, "form");
  const body = getJarBody(draft?.bodyStyle, draft?.customBody);
  const customBody = draft?.customBody && { ...draft.customBody, artworkUrl: preview?.bodyArtworkUrl };
  const frame = draft?.photoFrame || (body ? coverPhotoFrame(body.window, draft?.selectedDesignType === "AI" ? WHOLE_PHOTO : draft?.originalContentFrame || WHOLE_PHOTO) : null);
  return <li className="min-w-0 rounded-2xl border border-emerald-100 p-4">
    <div className="flex items-center gap-3">
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-50/60">
      {imageError ? <button type="button" aria-label="미리보기 다시 불러오기" className="min-h-11 px-1 text-xs text-emerald-800 underline" onClick={() => setRetry(value => value + 1)}>재시도</button>
        : preview?.previewUrl ? <JarDesignImage bodyStyle={draft?.bodyStyle || row.bodyStyle} customBody={customBody} imageUrl={preview.previewUrl} photoFrame={frame}
          slot={draft ? storedSlot(draft) : null} imageStyle={toCutoutMaskStyle(draft?.cutoutRegions || draft?.cutoutPoints)}
          alt={`디자인 초안 #${row.draftId} 미리보기`} className="h-14 w-14" onImageError={() => setImageError(true)} />
          : <p role="status" className="text-sm text-slate-500"><span aria-hidden="true">…</span><span className="sr-only">미리보기를 불러오는 중이에요.</span></p>}
    </div>
    <div className="min-w-0 flex-1">
    <p className="break-words text-sm font-bold text-slate-800">{typeof form?.name === "string" && form.name.trim() ? form.name : `디자인 초안 #${row.draftId}`}</p>
    <p className="mt-1 text-xs font-bold text-emerald-800">{step}/5 · {DESIGN_STEPS[step - 1]}</p>
    <ol aria-label="제작 진행 상황" className="mt-2 flex gap-1">{DESIGN_STEPS.map((label, index) => <li key={label} title={label} aria-current={index + 1 === step ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${index < step ? "bg-emerald-700" : "bg-slate-100"}`}><span className="sr-only">{index + 1}. {label}{index + 1 === step ? " (현재 단계)" : ""}</span></li>)}</ol>
    </div>
    </div>
    <dl className="mt-3 space-y-1 text-xs text-slate-500">
      <div className="flex flex-wrap gap-x-1"><dt>생성 시간 :</dt><dd>{timeLabel(row.createdAt)}</dd></div>
      <div className="flex flex-wrap gap-x-1"><dt>보관 기한 :</dt><dd>{timeLabel(row.expiresAt)}</dd></div>
    </dl>
    <div className="mt-4 flex flex-wrap gap-2">
      <Link aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} to={`/jars/design/new?draft=${row.draftId}`} className={`${actionClass} border-emerald-200 text-emerald-800 hover:bg-emerald-50`}>이어서 만들기</Link>
      <button type="button" disabled={busy} className={`${actionClass} border-slate-200 text-slate-600 hover:bg-rose-50`} onClick={() => setConfirming(true)}>삭제하기</button>
    </div>
    {confirming && <div className="mt-3 rounded-xl bg-rose-50 p-3" role="group" aria-label="초안 삭제 확인">
      <p className="text-sm text-rose-900">이 작업을 삭제할까요? 삭제한 초안은 복구할 수 없어요.</p>
      <div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => onDelete(row.draftId)} className={`${actionClass} border-rose-200 text-rose-800`}>{busy ? "삭제 중…" : "삭제 확인"}</button><button type="button" disabled={busy} onClick={() => setConfirming(false)} className={actionClass}>취소</button></div>
    </div>}
  </li>;
}

/** 유효한 본인 초안을 두 개씩 보여주며, 삭제 후 마지막 페이지도 다시 맞춘다. */
export default function DesignDraftShelf({ userId }) {
  const gate = useRequestGate(userId);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const deletingRef = useRef(false);
  const load = useCallback(async (target = 0) => {
    if (!userId) return;
    const current = gate.begin("drafts");
    setLoading(true); setError("");
    try {
      let result = await listJarDesignDrafts(target);
      // 다른 탭에서 작업을 정리한 경우에도 비어 있는 마지막 페이지에 머물지 않는다.
      while (current() && !result.items.length && target > 0) result = await listJarDesignDrafts(--target);
      if (!current()) return;
      setRows(result.items); setPage(result.page); setHasNext(result.hasNext);
    } catch {
      if (current()) setError("이어 만들 작업을 불러오지 못했어요.");
    } finally { if (current()) setLoading(false); }
  }, [gate, userId]);
  useEffect(() => {
    setRows([]); setPage(0); setHasNext(false); setDeleting(null); deletingRef.current = false;
    void load();
  }, [load]);
  async function remove(draftId) {
    if (deletingRef.current) return;
    deletingRef.current = true;
    const current = gate.begin("delete");
    setDeleting(draftId); setError("");
    try {
      await deleteJarDesignDraft(draftId);
      if (!current()) return;
      for (const part of ["selection", "form", "step"]) {
        try { writeDesignResume(userId, draftId, part, null); } catch { /* 서버 삭제 성공은 유지한다. */ }
      }
      await load(page);
    } catch { if (current()) setError("초안을 삭제하지 못했어요. 다시 시도해 주세요."); }
    finally { if (current()) { deletingRef.current = false; setDeleting(null); } }
  }
  if (!userId || (!loading && !error && !rows.length && page === 0)) return null;
  return <section id="design-drafts" aria-label="내 작업 이어 만들기" className="mb-7 rounded-[24px] border border-emerald-100 bg-white/90 p-5 shadow-sm">
    <h2 className="text-lg font-extrabold text-emerald-950">내 작업 이어 만들기</h2>
    <p className="mt-1 text-sm text-slate-500">만들던 저금통과 저장한 단계부터 이어서 완성해 보세요.</p>
    {loading && <p role="status" className="mt-3 text-sm">작업을 불러오는 중이에요.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error} <button type="button" disabled={deleting != null} className="underline" onClick={() => load(page)}>다시 불러오기</button></p>}
    {!loading && <ul className="mt-4 grid gap-3 sm:grid-cols-2">{rows.map(row => <DraftCard key={`${userId}:${row.draftId}`} row={row} userId={userId} busy={deleting != null} onDelete={remove} />)}</ul>}
    {(page > 0 || hasNext) && <nav aria-label="디자인 초안 페이지" className="mt-3 flex items-center justify-center gap-2">
      <button type="button" disabled={loading || deleting != null || page === 0} onClick={() => load(page - 1)} className={pageButtonClass}>이전</button>
      <span aria-live="polite" aria-label={`${page + 1} 페이지`} className="min-w-4 text-center text-xs font-semibold tabular-nums text-slate-600">{page + 1}</span>
      <button type="button" disabled={loading || deleting != null || !hasNext} onClick={() => load(page + 1)} className={pageButtonClass}>다음</button>
    </nav>}
  </section>;
}
