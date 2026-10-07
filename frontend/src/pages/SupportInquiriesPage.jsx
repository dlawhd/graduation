import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSupportInquiries, getSupportPermissions, supportError } from "../api/supportApi";
import { SUPPORT_STATUS, SUPPORT_STYLE, supportTime } from "../features/support/supportView.mjs";
import SupportInquiryDetail from "../features/support/SupportInquiryDetail";

/** 내 문의와 운영 문의함을 표시한다. 목록은 커서로 나누고 권한은 서버에서 다시 검사한다. */
export default function SupportInquiriesPage({ me, checkingAuth, operator = false }) {
  const { inquiryId } = useParams();
  const userId = me?.userId ?? me?.id;
  const [permission, setPermission] = useState(null);
  const [status, setStatus] = useState("");
  const [cursors, setCursors] = useState([undefined]);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const allowed = !operator || (permission?.userId === userId && permission.operator);
  useEffect(() => {
    if (!operator || !userId) return;
    const controller = new AbortController(); setPermission(null); setError("");
    getSupportPermissions({ signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setPermission({ ...data, userId });
    }).catch((e) => { if (!controller.signal.aborted) setError(supportError(e)); });
    return () => controller.abort();
  }, [operator, userId, refresh]);
  const before = cursors[page];
  useEffect(() => {
    if (!userId || checkingAuth || !allowed || inquiryId) return;
    const controller = new AbortController(); setLoading(true); setResult(null); setError("");
    getSupportInquiries({ before, status: status || undefined, operator, signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch((e) => { if (!controller.signal.aborted) setError(supportError(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, checkingAuth, allowed, inquiryId, before, status, operator, refresh]);
  const base = operator ? "/admin/support/inquiries" : "/support/inquiries";
  const button = "min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold disabled:opacity-35";
  return <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
    <header className="mb-7"><p className="text-xs font-bold tracking-widest text-emerald-700">MEMORY JAR / SUPPORT</p><h1 className="mt-2 text-2xl font-black text-slate-900">{operator ? "운영 문의함" : "내 문의"}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{operator ? "실패 기록과 공유 원본을 확인하고, 확인된 사실을 중심으로 답변해 주세요." : "접수한 AI 생성 문의와 답변을 확인해요. 답변이 등록되면 알림함으로 알려드려요."}</p></header>
    {checkingAuth ? <p role="status">로그인을 확인하고 있어요.</p> : !me ? <div className="rounded-2xl bg-white p-6"><p>로그인 후 문의를 확인할 수 있어요.</p><Link to="/" className="mt-3 inline-block text-emerald-700 underline">로그인 화면으로</Link></div> : operator && !allowed ? <div className="rounded-2xl bg-white p-6"><p role={error || permission ? "alert" : "status"}>{error || (permission ? "서비스 운영자만 이용할 수 있습니다. 저금통 관리자 권한과는 다릅니다." : "운영자 권한을 확인하고 있어요.")}</p>{error && <button className={button} onClick={() => setRefresh((n) => n + 1)}>다시 확인</button>}</div> : inquiryId ? <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8"><Link to={base} className="mb-5 inline-block text-sm font-bold text-emerald-700">← 문의 목록</Link><SupportInquiryDetail key={`${userId}:${operator}:${inquiryId}`} inquiryId={inquiryId} operator={operator} /></div> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {operator && <label className="text-sm font-semibold">처리 상태 <select value={status} onChange={(e) => { setStatus(e.target.value); setCursors([undefined]); setPage(0); }} className="ml-2 min-h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="">전체</option>{["OPEN", "IN_PROGRESS", "ANSWERED"].map((key) => <option key={key} value={key}>{SUPPORT_STATUS[key]}</option>)}</select></label>}
        <button type="button" disabled={loading} onClick={() => setRefresh((n) => n + 1)} className={button}>새로고침</button>
      </div>
      {loading && <p role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-500">문의 목록을 불러오고 있어요.</p>}
      {error && <p role="alert" className="rounded-2xl bg-rose-50 p-5 text-sm text-rose-700">{error}</p>}
      {!loading && !error && result?.items?.length === 0 && <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">{operator ? "해당 상태의 문의가 없습니다." : "아직 접수한 문의가 없어요. 실패한 AI 후보에서 문의할 수 있어요."}</p>}
      <div className="space-y-3">{result?.items?.map((ticket) => <Link key={ticket.inquiryId} to={`${base}/${ticket.inquiryId}`} className="block rounded-2xl border border-slate-200 bg-white p-5 hover:border-emerald-300">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-slate-800">문의 #{ticket.inquiryId} / {SUPPORT_STYLE[ticket.style] || ticket.style}</p><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{SUPPORT_STATUS[ticket.status] || ticket.status}</span></div>
        <p className="mt-3 line-clamp-2 break-words text-sm leading-6 text-slate-600">{ticket.contentExpired ? "문의 보관 기간이 지났습니다." : ticket.description}</p><p className="mt-3 text-xs text-slate-400">후보 #{ticket.generationId} / {supportTime(ticket.createdAt)}</p>
      </Link>)}</div>
      <nav aria-label="문의 목록 페이지" className="mt-6 flex items-center justify-center gap-4"><button type="button" disabled={loading || page === 0} onClick={() => setPage((n) => n - 1)} className={button}>← 이전</button><span className="text-sm text-slate-500">{page + 1} 페이지</span><button type="button" disabled={loading || !result?.nextBefore} onClick={() => { setCursors((prev) => [...prev.slice(0, page + 1), result.nextBefore]); setPage((n) => n + 1); }} className={button}>다음 →</button></nav>
    </>}
  </div>;
}
