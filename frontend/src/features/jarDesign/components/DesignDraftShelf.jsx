import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { deleteJarDesignDraft, getJarDesignOriginalPreview, getJarDesignGenerationPreview, listJarDesignDrafts } from "../../../api/jarDesignDraftApi";
import { useRequestGate } from "../../../api/useRequestGate";
import { readDesignResume, writeDesignResume } from "../designResume.mjs";
import { BODY_ONLY_DESIGN_STEPS, DESIGN_STEPS, resumableDesignStep } from "../designWorkflow.mjs";
import { storedSlot } from "../slotGeometry.mjs";
import { toCutoutMaskStyle } from "../cutoutGeometry.mjs";
import { getJarBody } from "../jarBodies.mjs";
import { coverPhotoFrame, WHOLE_PHOTO } from "../photoFraming.mjs";
import JarDesignImage from "./JarDesignImage";
import { listEarlyDesignDrafts, readEarlyDesignDraft, writeEarlyDesignDraft } from "../earlyDesignDraftStore.mjs";
import { createDesignDraftPager } from "../designDraftPager.mjs";

const actionClass = "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-bold disabled:opacity-40";
const pageButtonClass = "inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-40";
const timeLabel = value => value && Number.isFinite(typeof value === "number" ? value : Date.parse(value))
  ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "확인할 수 없어요";

/** 화면에 보이는 두 작업만 소유자 전용 이미지 주소를 발급받는다. 주소는 저장소에 남기지 않는다. */
function DraftCard({ row, userId, busy, onDelete }) {
  const [preview, setPreview] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const draft = row.kind === "LOCAL" ? preview?.draft : row.design;
  const bodyOnly = row.design?.selectedDesignType === "BODY_ONLY";
  const needsPreview = !bodyOnly || row.design?.bodyArtworkAvailable;
  useEffect(() => {
    let current = true;
    setPreview(null); setImageError(false);
    const urls = [];
    const request = row.kind === "LOCAL" ? readEarlyDesignDraft(userId, row.id).then(record => {
      if (!record?.state || record.cleared || record.expiresAt <= Date.now()) throw new Error("저장한 작업을 다시 불러와 주세요.");
      if (!current) return null;
      const state = record.state;
      const catalogBodyOnly = state.catalogOpen && state.catalogMode === "body-only";
      const fileUrl = !catalogBodyOnly && state.sourceImage ? URL.createObjectURL(state.sourceImage) : "";
      if (fileUrl) urls.push(fileUrl);
      const style = state.bodyStyle || (state.customBody ? "CUSTOM" : null);
      return { local: true, draft: { ...state, bodyStyle: style },
        rawUrl: !getJarBody(style, state.customBody) ? state.bodyCanvas : null,
        previewUrl: catalogBodyOnly ? "" : state.inputMode === "UPLOAD" ? fileUrl : state.imageCanvas || fileUrl };
    }) : row.design?.selectedDesignType === "AI" && row.design.selectedGenerationId
      ? getJarDesignGenerationPreview(row.draftId, row.design.selectedGenerationId)
      : needsPreview ? getJarDesignOriginalPreview(row.draftId) : Promise.resolve(null);
    request.then(result => { if (current) setPreview(result); })
      .catch(() => { if (current) setImageError(true); });
    return () => { current = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [row.kind, row.id, row.draftId, row.updatedAt, row.design?.selectedDesignType, row.design?.selectedGenerationId, needsPreview, userId, retry]);
  const step = row.kind === "LOCAL" ? row.step : resumableDesignStep(draft, readDesignResume(userId, row.draftId, "selection"), readDesignResume(userId, row.draftId, "step"));
  const catalogBodyOnly = preview?.local && draft?.catalogOpen && draft?.catalogMode === "body-only";
  const steps = bodyOnly || catalogBodyOnly ? BODY_ONLY_DESIGN_STEPS : DESIGN_STEPS;
  const displayStep = bodyOnly ? (step === 5 ? 3 : 2) : step;
  const form = row.kind === "LOCAL" ? null : readDesignResume(userId, row.draftId, "form");
  const body = getJarBody(draft?.bodyStyle, draft?.customBody);
  const customBody = draft?.customBody && { ...draft.customBody, artworkUrl: preview?.local ? draft.customBody.artworkUrl : preview?.bodyArtworkUrl };
  const frame = draft?.photoFrame || (body ? coverPhotoFrame(body.window, draft?.selectedDesignType === "AI" ? WHOLE_PHOTO : draft?.originalContentFrame || WHOLE_PHOTO) : null);
  return <li className="min-w-0 rounded-2xl border border-emerald-100 p-4">
    <div className="flex items-center gap-3">
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-50/60">
      {imageError ? <button type="button" aria-label="미리보기 다시 불러오기" className="min-h-11 px-1 text-xs text-emerald-800 underline" onClick={() => setRetry(value => value + 1)}>재시도</button>
        : preview?.local && (preview.rawUrl || (!body && preview.previewUrl)) ? <img src={preview.rawUrl || preview.previewUrl} alt="저장한 그림판 미리보기" className="h-14 w-14 object-contain" onError={() => setImageError(true)} />
        : preview?.previewUrl || ((preview?.local || bodyOnly) && body) ? <JarDesignImage bodyStyle={draft?.bodyStyle || row.bodyStyle} customBody={customBody} imageUrl={preview?.previewUrl} photoFrame={frame} fillEmptyBody={bodyOnly || catalogBodyOnly}
          slot={draft ? storedSlot(draft) : null} imageStyle={toCutoutMaskStyle(draft?.cutoutRegions || draft?.cutoutPoints)}
          alt={`디자인 초안 #${row.draftId} 미리보기`} className="h-14 w-14" onImageError={() => setImageError(true)} />
          : preview?.local ? <span className="px-1 text-center text-[10px] text-slate-500">그림 준비 중</span> : <p role="status" className="text-sm text-slate-500"><span aria-hidden="true">…</span><span className="sr-only">미리보기를 불러오는 중이에요.</span></p>}
    </div>
    <div className="min-w-0 flex-1">
    <p className="break-words text-sm font-bold text-slate-800">{typeof form?.name === "string" && form.name.trim() ? form.name : (row.kind === "LOCAL" ? "만들고 있는 저금통" : `디자인 초안 #${row.draftId}`)}</p>
    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs font-bold text-emerald-800">
      {steps[displayStep - 1]} <small className="whitespace-nowrap text-[11px] font-semibold">{displayStep}/{steps.length}단계</small>
    </p>
    <ol aria-label="제작 진행 상황" className="mt-2 flex gap-1">{steps.map((label, index) => <li key={label} title={label} aria-current={index + 1 === displayStep ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${index < displayStep ? "bg-emerald-700" : "bg-slate-100"}`}><span className="sr-only">{index + 1}. {label}{index + 1 === displayStep ? " (현재 단계)" : ""}</span></li>)}</ol>
    </div>
    </div>
    {row.kind === "LOCAL" && <p className="mt-2 text-[11px] font-semibold text-slate-500">이 브라우저에 저장한 작업</p>}
    <dl className="mt-3 space-y-1 text-xs text-slate-500">
      <div className="flex flex-wrap gap-x-1"><dt>생성 시간 :</dt><dd>{timeLabel(row.createdAt)}</dd></div>
      <div className="flex flex-wrap gap-x-1"><dt>보관 기한 :</dt><dd>{timeLabel(row.expiresAt)}</dd></div>
    </dl>
    <div className="mt-4 flex flex-wrap gap-2">
      <Link aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} to={row.kind === "LOCAL" ? `/jars/design/new?work=${row.id}` : `/jars/design/new?draft=${row.draftId}`} className={`${actionClass} border-emerald-200 text-emerald-800 hover:bg-emerald-50`}>이어서 만들기</Link>
      <button type="button" disabled={busy} className={`${actionClass} border-slate-200 text-slate-600 hover:bg-rose-50`} onClick={() => setConfirming(true)}>삭제하기</button>
    </div>
    {confirming && <div className="mt-3 rounded-xl bg-rose-50 p-3" role="group" aria-label="초안 삭제 확인">
      <p className="text-sm text-rose-900">이 작업을 삭제할까요? 삭제한 초안은 복구할 수 없어요.</p>
      <div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => onDelete(row)} className={`${actionClass} border-rose-200 text-rose-800`}>{busy ? "삭제 중…" : "삭제 확인"}</button><button type="button" disabled={busy} onClick={() => setConfirming(false)} className={actionClass}>취소</button></div>
    </div>}
  </li>;
}

/** 유효한 본인 초안을 두 개씩 보여주며, 삭제 후 마지막 페이지도 다시 맞춘다. */
export default function DesignDraftShelf({ userId }) {
  const gate = useRequestGate(userId);
  const pager = useMemo(() => createDesignDraftPager({ readLocal: () => listEarlyDesignDrafts(userId), listServer: listJarDesignDrafts }), [userId]);
  const [warning, setWarning] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const deletingRef = useRef(false);
  const load = useCallback(async (target = 0) => {
    if (!userId) return;
    const current = gate.begin("drafts");
    setLoading(true); setError("");
    try {
      const result = await pager.load(target);
      if (!current()) return;
      setRows(result.items); setPage(result.page); setTotalPages(result.totalPages); setWarning(result.warning || "");
    } catch {
      if (current()) setError("이어 만들 작업을 불러오지 못했어요.");
    } finally { if (current()) setLoading(false); }
  }, [gate, userId, pager]);
  useEffect(() => {
    setRows([]); setPage(0); setTotalPages(0); setDeleting(null); deletingRef.current = false;
    void load();
  }, [load]);
  async function remove(row) {
    const draftId = row.draftId;
    if (deletingRef.current) return;
    deletingRef.current = true;
    const current = gate.begin("delete");
    setDeleting(draftId); setError("");
    try {
      if (row.kind === "LOCAL") await writeEarlyDesignDraft(userId, row.id, {}, row.revision, { remove: true });
      else await deleteJarDesignDraft(draftId);
      if (!current()) return;
      for (const part of ["selection", "form", "step"]) {
        try { writeDesignResume(userId, draftId, part, null); } catch { /* 서버 삭제 성공은 유지한다. */ }
      }
      pager.reset();
      await load(page);
    } catch { if (current()) setError("초안을 삭제하지 못했어요. 다시 시도해 주세요."); }
    finally { if (current()) { deletingRef.current = false; setDeleting(null); } }
  }
  if (!userId || (!loading && !error && !rows.length && page === 0)) return null;
  // 모바일에서도 한 줄에 담기도록, 페이지가 많을 때는 처음·끝과 현재 페이지 주변만 표시한다.
  const firstNearby = Math.max(0, Math.min(page - 1, totalPages - 3));
  const pageNumbers = totalPages <= 5
    ? Array.from({ length: totalPages }, (_, index) => index)
    : [...new Set([0, firstNearby, firstNearby + 1, firstNearby + 2, totalPages - 1])];
  const navigationDisabled = loading || deleting != null;
  return <section id="design-drafts" aria-label="내 작업 이어 만들기" className="mb-7 rounded-[24px] border border-emerald-100 bg-white/90 p-5 shadow-sm">
    <h2 className="text-lg font-extrabold text-emerald-950">내 작업 이어 만들기</h2>
    <p className="mt-1 text-sm text-slate-500">만들던 저금통과 저장한 단계부터 이어서 완성해 보세요.</p>
    {loading && <p role="status" className="mt-3 text-sm">작업을 불러오는 중이에요.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error} <button type="button" disabled={deleting != null} className="underline" onClick={() => { pager.reset(); void load(page); }}>다시 불러오기</button></p>}
    {warning && <p role="status" className="mt-3 text-sm text-amber-800">{warning} <button type="button" disabled={loading || deleting != null} onClick={() => { pager.reset(); void load(page); }} className="underline">다시 불러오기</button></p>}
    {!loading && <ul className="mt-4 grid gap-3 sm:grid-cols-2">{rows.map(row => <DraftCard key={`${userId}:${row.draftId}`} row={row} userId={userId} busy={deleting != null} onDelete={remove} />)}</ul>}
    {totalPages > 1 && <nav aria-label="디자인 초안 페이지" className="mt-3 flex flex-wrap items-center justify-center gap-2">
      <button type="button" disabled={navigationDisabled || page === 0} onClick={() => load(page - 1)} className={pageButtonClass}>이전</button>
      {pageNumbers.map((number, index) => <Fragment key={number}>
        {index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true" className="text-xs text-slate-500">…</span>}
        <button type="button" aria-label={`${number + 1} 페이지`} aria-current={page === number ? "page" : undefined}
          disabled={navigationDisabled} onClick={() => { if (page !== number) void load(number); }}
          className={`${pageButtonClass} min-w-8 tabular-nums ${page === number ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-600"}`}>{number + 1}</button>
      </Fragment>)}
      <button type="button" disabled={navigationDisabled || page + 1 >= totalPages} onClick={() => load(page + 1)} className={pageButtonClass}>다음</button>
    </nav>}
  </section>;
}
