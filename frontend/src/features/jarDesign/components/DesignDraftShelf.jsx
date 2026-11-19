import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listJarDesignDrafts } from "../../../api/jarDesignDraftApi";
import { useRequestGate } from "../../../api/useRequestGate";
import { readBodyDraft } from "../customJarBody.mjs";

/** 이미지 다운로드 없이 본인의 유효한 서버 초안을 페이지 단위로 보여준다. */
export default function DesignDraftShelf({ userId }) {
  const gate = useRequestGate(userId);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLocalBody] = useState(() => {
    try { return Boolean(readBodyDraft(sessionStorage, userId)); } catch { return false; }
  });
  const load = useCallback(async (target = 0) => {
    if (!userId) return;
    const current = gate.begin("drafts");
    setLoading(true);
    setError("");
    try {
      const result = await listJarDesignDrafts(target);
      if (!current()) return;
      setRows(result.items);
      setPage(result.page);
      setHasNext(result.hasNext);
    } catch {
      if (current()) setError("이어 만들 작업을 불러오지 못했어요.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [gate, userId]);
  useEffect(() => { setRows([]); setPage(0); setHasNext(false); void load(); }, [load]); // 계정 변경 시 이전 목록 폐기
  if (!userId || (!hasLocalBody && !loading && !error && !rows.length && page === 0)) return null;
  return <section aria-label="내 작업 이어 만들기" className="mb-7 rounded-[24px] border border-emerald-100 bg-white/90 p-5 shadow-sm">
    <h2 className="text-lg font-extrabold text-emerald-950">내 작업 이어 만들기</h2>
    <p className="mt-1 text-sm text-slate-500">저장한 사진 배치·AI 후보·입구 설정부터 계속 만들어요.</p>
    {hasLocalBody && <div className="mt-4 rounded-2xl border border-emerald-100 p-4">
      <p className="font-bold text-slate-800">직접 만들던 저금통 본체</p>
      <p className="mt-1 text-sm text-slate-600">이 탭에 저장한 틀 편집을 이어가요.</p>
      <Link to="/jars/design/new?body=CUSTOM" className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-emerald-200 px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50">본체 이어 만들기 →</Link>
    </div>}
    {loading && <p role="status" className="mt-3 text-sm">작업을 불러오는 중이에요.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error} <button type="button" className="underline" onClick={() => load(page)}>다시 시도</button></p>}
    {!loading && !error && <ul className="mt-4 grid gap-3 sm:grid-cols-2">{rows.map(row => <li key={row.draftId} className="rounded-2xl border border-emerald-100 p-4">
      <p className="font-bold text-slate-800">디자인 초안 #{row.draftId}</p>
      <p className="mt-1 text-sm text-slate-600">{row.selectedDesignType === "AI" ? "AI 후보 선택됨" : row.selectedDesignType === "ORIGINAL" ? "사진·그림 편집" : "디자인 선택 단계"}</p>
      <p className="mt-2 text-xs text-slate-500">보관 기한 {new Date(row.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (KST)</p>
      <Link to={`/jars/design/new?draft=${row.draftId}`} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-emerald-200 px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50">이어서 만들기 →</Link>
    </li>)}</ul>}
    {(page > 0 || hasNext) && <div className="mt-4 flex gap-3">
      <button type="button" disabled={loading || page === 0} onClick={() => load(page - 1)} className="min-h-11 rounded-xl border px-4 disabled:opacity-40">이전 작업</button>
      <button type="button" disabled={loading || !hasNext} onClick={() => load(page + 1)} className="min-h-11 rounded-xl border px-4 disabled:opacity-40">다음 작업</button>
    </div>}
  </section>;
}
