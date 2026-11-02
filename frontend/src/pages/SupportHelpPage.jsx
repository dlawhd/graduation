import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getSupportFaq, supportError } from "../api/supportApi";
import { SUPPORT_CATEGORIES } from "../features/support/supportContext.mjs";

/** 로그인 없이 기본 도움말을 검색하고, 해결되지 않은 문제는 일반/로그인 도움 문의로 연결한다. */
export default function SupportHelpPage() {
  const location=useLocation();const [items,setItems]=useState([]);const [search,setSearch]=useState("");
  const [error,setError]=useState("");const [loading,setLoading]=useState(true);const [reload,setReload]=useState(0);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");
    getSupportFaq({signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setItems(Array.isArray(data)?data:[]);})
      .catch(e=>{if(!controller.signal.aborted)setError(supportError(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();},[reload]);
  const visible=useMemo(()=>{const query=search.trim().toLowerCase();return items.filter(item=>`${item.question} ${item.answer} ${SUPPORT_CATEGORIES[item.category]||""}`.toLowerCase().includes(query));},[items,search]);
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:py-12"><header><p className="text-xs font-bold tracking-widest text-emerald-700">MEMORY JAR / HELP</p><h1 className="mt-2 text-3xl font-black">도움말·문의</h1><p className="mt-3 text-sm leading-6 text-slate-500">자주 묻는 질문을 확인하거나 문제가 생긴 상황을 알려주세요.</p></header>
    <div className="flex flex-wrap gap-3"><Link to={`/support/new${location.search}`} className="inline-flex min-h-12 items-center rounded-xl bg-emerald-700 px-5 font-bold text-white">문의하기</Link><Link to="/support/inquiries" className="inline-flex min-h-12 items-center rounded-xl border border-slate-200 px-5 font-bold">내 문의</Link><Link to="/support/login-help" className="inline-flex min-h-12 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 font-bold text-emerald-800">로그인 문제 도움</Link></div>
    <label className="block text-sm font-bold">자주 묻는 질문 검색<input aria-label="도움말 검색" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="사진, 3D, 초대, 로그인…" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-4"/></label>
    {loading&&<p role="status">도움말을 불러오고 있어요.</p>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}<button type="button" onClick={()=>setReload(n=>n+1)} className="ml-3 min-h-11 font-bold underline">다시 확인</button></p>}
    {!loading&&!error&&visible.length===0&&<p className="rounded-xl bg-slate-50 p-5 text-sm">검색 결과가 없어요. 다른 검색어를 사용하거나 문의를 남겨 주세요.</p>}
    <div className="space-y-3">{visible.map(item=><details key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5"><summary className="min-h-11 cursor-pointer font-bold text-slate-800">{item.question}</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{item.answer}</p></details>)}</div>
  </main>;
}
