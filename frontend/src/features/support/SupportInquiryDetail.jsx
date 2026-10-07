import { useEffect, useRef, useState } from "react";
import { getSupportInquiry, getSupportImage, startSupportReview, replySupportInquiry, supportError } from "../../api/supportApi";
import { SUPPORT_STATUS, SUPPORT_STYLE, supportTime } from "./supportView.mjs";

/** 내 문의와 운영자 상세에서 같은 내용을 표시한다. 사진은 사용자가 열기를 눌러야 요청한다. */
export default function SupportInquiryDetail({ inquiryId, operator = false, onUpdated }) {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [image, setImage] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const inFlight = useRef(false);
  const imageInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setTicket(null); setImage(""); setReply(""); setLoading(true); setError("");
    getSupportInquiry(inquiryId, operator, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setTicket(data); })
      .catch((e) => { if (!controller.signal.aborted) setError(supportError(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [inquiryId, operator, refresh]);
  // 이미 발급된 URL은 즉시 철회할 수 없으므로 화면에서도 1분 뒤 지우고 새 발급을 요구한다.
  useEffect(() => { if (!image) return; const timer = setTimeout(() => setImage(""), 60_000); return () => clearTimeout(timer); }, [image]);

  async function mutate(action) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { const data = await action(); if (mounted.current) { setTicket(data); setReply(""); onUpdated?.(data); } }
    catch (e) { if (mounted.current) setError(supportError(e)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function openImage() {
    if (imageInFlight.current) return;
    imageInFlight.current = true;
    setImageBusy(true); setError("");
    try { const data = await getSupportImage(inquiryId, operator); if (mounted.current) setImage(data.previewUrl); }
    catch (e) { if (mounted.current) setError(supportError(e)); }
    finally { imageInFlight.current = false; if (mounted.current) setImageBusy(false); }
  }

  const button = "min-h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 disabled:opacity-40";
  return <section aria-label="문의 상세" className="space-y-5">
    {loading && <p role="status" className="text-sm text-slate-500">문의 내용을 불러오고 있어요.</p>}
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}<button type="button" onClick={() => setRefresh((n) => n + 1)} className="ml-3 underline">다시 확인</button></div>}
    {ticket && <>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black text-slate-900">문의 #{ticket.inquiryId}</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{SUPPORT_STATUS[ticket.status] || ticket.status}</span></div>
      <dl className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
        {[["선택한 스타일", SUPPORT_STYLE[ticket.style] || ticket.style], ["실패한 후보", `#${ticket.generationId}`], ["발생 시각", supportTime(ticket.failedAt)], ["확인 코드", ticket.errorCode]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-800">{value}</dd></div>)}
        {operator && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">서버 생성 기록</dt><dd className="mt-1 break-all text-xs text-slate-700">{ticket.model} / {ticket.promptVersion} / Draft #{ticket.draftId}</dd></div>}
      </dl>
      {ticket.contentExpired ? <p className="text-sm text-slate-500">문의 내용과 답변은 90일 보관 기간이 지나 삭제되었습니다.</p> : <div><h3 className="mb-2 text-sm font-bold">문의 내용</h3><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{ticket.description}</p></div>}
      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-bold">공유한 원본 이미지</p><p className="mt-1 text-xs leading-5 text-slate-500">{ticket.imageAvailable ? `${supportTime(ticket.imageExpiresAt)}까지 보관합니다. 열람 주소는 1분 후 만료됩니다.` : "사진 보관 기간이 지났거나 사진 보관이 완료되지 않았습니다."}</p>
        {ticket.imageAvailable && <button type="button" disabled={imageBusy} onClick={() => image ? setImage("") : void openImage()} className={button + " mt-3"}>{imageBusy ? "사진 확인 중…" : image ? "원본 이미지 닫기" : "원본 이미지 보기"}</button>}
        {image && <img src={image} alt="문의 접수 시 공유한 원본" referrerPolicy="no-referrer" className="mt-4 max-h-80 w-full rounded-xl bg-slate-50 object-contain" onError={() => { setImage(""); setError("사진 주소가 만료되었거나 파일을 읽지 못했어요. 다시 열어 주세요."); }} />}
      </div>
      {ticket.reply && !ticket.contentExpired && <div className="rounded-2xl bg-emerald-50 p-5"><h3 className="font-bold text-emerald-900">운영자 답변</h3><p className="mt-1 text-xs text-emerald-700">{supportTime(ticket.repliedAt)}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{ticket.reply}</p></div>}
      {ticket.status === "COPY_FAILED" && <p className="text-sm text-rose-700">원본 보관에 실패하여 접수되지 않았습니다. 정리가 끝난 뒤 실패한 후보에서 다시 접수해 주세요.</p>}
      {operator && ["OPEN", "IN_PROGRESS"].includes(ticket.status) && !ticket.contentExpired && <div className="space-y-3 border-t border-slate-100 pt-5">
        {ticket.status === "OPEN" && <button type="button" className={button} disabled={busy} onClick={() => void mutate(() => startSupportReview(inquiryId))}>확인 중으로 변경</button>}
        <label className="block text-sm font-bold" htmlFor="support-reply">운영자 답변</label><textarea id="support-reply" rows={6} maxLength={3000} disabled={busy} value={reply} onChange={(e) => setReply(e.target.value)} className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm" placeholder="확인된 원인과 아직 확인되지 않은 내용을 구분해 주세요. 변환 성공을 보장하는 답변은 피해주세요." />
        <p className="text-right text-xs text-slate-500">{reply.length} / 3,000자</p><button type="button" disabled={busy || !reply.trim()} className={button} onClick={() => void mutate(() => replySupportInquiry(inquiryId, reply))}>{busy ? "저장 중…" : "답변 등록하고 알림 보내기"}</button>
      </div>}
    </>}
  </section>;
}
