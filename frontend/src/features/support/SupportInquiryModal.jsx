import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { createSupportInquiry, supportError } from "../../api/supportApi";
import { getJarDesignOriginalPreview } from "../../api/jarDesignDraftApi";
import { canSubmitInquiry, SUPPORT_STYLE, supportTime } from "./supportView.mjs";
import SupportInquiryDetail from "./SupportInquiryDetail";

/** 디자인 화면을 유지한 채 문의한다. 원본 미리보기와 필수 공유 동의를 확인해야 접수할 수 있다. */
export default function SupportInquiryModal({ draftId, generation, existing, originalUrl, onClose, onSubmitted }) {
  const dialog = useRef(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [ticket, setTicket] = useState(existing || null);
  const [description, setDescription] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [url, setUrl] = useState(originalUrl || "");
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const submitted = ticket && ["COPYING", "OPEN", "IN_PROGRESS", "ANSWERED"].includes(ticket.status);
  useEffect(() => {
    mounted.current = true;
    dialog.current.showModal();
    // 긴 문의 창을 스크롤할 때 뒤의 디자인 화면이 함께 움직이지 않게 한다.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { mounted.current = false; document.body.style.overflow = previousOverflow; };
  }, []);
  async function refreshImage() {
    if (checking) return;
    setChecking(true); setImageReady(false); setImageError(false);
    try { const preview = await getJarDesignOriginalPreview(draftId); if (mounted.current) setUrl(preview.previewUrl); }
    catch (e) { if (mounted.current) { setError(supportError(e)); setImageError(true); } }
    finally { if (mounted.current) setChecking(false); }
  }
  useEffect(() => { if (!url && !submitted) void refreshImage(); }, []);
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || !canSubmitInquiry(description, agreed, imageReady, busy)) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await createSupportInquiry({ draftId, generationId: generation.generationId, description, shareOriginal: agreed });
      if (mounted.current) { setTicket(result); onSubmitted(result); }
    } catch (e) { if (mounted.current) setError(supportError(e)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const close = () => { if (!inFlight.current) onClose(); };
  return createPortal(<dialog ref={dialog} onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }} aria-labelledby="support-modal-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,640px)] overflow-auto rounded-3xl bg-white p-5 text-slate-800 shadow-2xl backdrop:bg-slate-950/45 sm:p-7">
    <header className="mb-5 flex items-center justify-between gap-3"><h2 id="support-modal-title" className="text-lg font-black">{submitted ? "접수한 문의" : "운영자에게 문의하기"}</h2><button type="button" disabled={busy} onClick={close} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold disabled:opacity-40">닫기</button></header>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {submitted ? <><p role="status" className="mb-4 text-sm text-emerald-800">접수 상태와 답변은 내 문의에서도 확인할 수 있어요.</p><SupportInquiryDetail key={ticket.inquiryId} inquiryId={ticket.inquiryId} /><Link to={`/support/inquiries/${ticket.inquiryId}`} className="mt-5 inline-block text-sm font-bold text-emerald-700 underline">내 문의에서 보기</Link></> : <form onSubmit={submit} className="space-y-5">
      <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6"><p className="font-bold">{SUPPORT_STYLE[generation.style] || generation.style} / 후보 #{generation.generationId}</p><p className="text-xs text-slate-500">발생 시각: {supportTime(generation.completedAt)}<br />확인 코드: {generation.errorCode || "INTERNAL_ERROR"}</p></div>
      <div><p className="mb-2 text-sm font-bold">운영자에게 공유할 원본</p><p className="mb-3 text-xs leading-5 text-slate-500">디자인에 업로드되어 서버에서 정규화한 원본 전체를 공유합니다. AI가 생성하지 못한 결과 이미지는 포함되지 않습니다.</p>
        {url && !imageError && <img src={url} alt="운영자에게 공유할 디자인 원본" referrerPolicy="no-referrer" onLoad={() => setImageReady(true)} onError={() => { setImageReady(false); setImageError(true); }} className="max-h-56 w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain" />}
        {(!url || imageError) && <button type="button" disabled={checking} onClick={() => void refreshImage()} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold">{checking ? "원본 확인 중…" : "원본 다시 불러오기"}</button>}
      </div>
      <div><label htmlFor="support-description" className="text-sm font-bold">어떤 문제가 있었나요?</label><textarea id="support-description" rows={4} maxLength={1000} required disabled={busy} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="기대했던 모습과 실제로 겪은 문제를 알려주세요. 비밀번호나 연락처는 적지 않아도 돼요." className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm" /><p className="text-right text-xs text-slate-500">{description.length} / 1,000자</p></div>
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><label className="flex items-start gap-3 text-sm font-semibold leading-6"><input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => setAgreed(e.target.checked)} className="mt-1.5 h-4 w-4 shrink-0 accent-emerald-600" />[필수] 문제 확인을 위해 원본 이미지를 운영자에게 공유합니다.</label><p className="mt-3 text-xs leading-5 text-slate-600">문의 확인 및 답변을 위해 운영자에게 원본과 실패 정보를 제공합니다. 원본 사본은 접수 시점부터 30일, 문의 내용과 답변은 90일 후 자동 삭제됩니다. 동의하지 않으면 문의를 접수할 수 없지만, 디자인 만들기는 계속 이용할 수 있어요.</p></div>
      <p className="text-xs leading-5 text-slate-500">제공자 정책에 따라 구체적인 제한 사유를 확인하지 못할 수 있어요. 문의 접수는 AI 변환 성공이나 재생성을 보장하지 않습니다.</p>
      <button type="submit" disabled={!canSubmitInquiry(description, agreed, imageReady, busy)} className="min-h-12 w-full rounded-xl bg-emerald-600 px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "원본 보관 및 문의 접수 중…" : "원본을 공유하고 문의 접수하기"}</button>
    </form>}
  </dialog>, document.body);
}
