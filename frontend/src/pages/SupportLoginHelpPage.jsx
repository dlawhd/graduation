import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { getGuestSupportSession, getSupportInquiries, supportError } from "../api/supportApi";
import { useRequestGate } from "../api/useRequestGate";
import SupportComposer from "../features/support/SupportComposer";
import SupportInquiryDetail from "../features/support/SupportInquiryDetail";
import SupportStatusBadge from "../features/support/SupportStatusBadge";
import { supportTitle } from "../features/support/supportContext.mjs";
import SupportLetterLayout, { SupportLetterIcon } from "../features/support/SupportLetterLayout";

/** 계정 로그인 없이 문의 전용 쿠키로 접수와 답변을 확인한다. 다른 브라우저/다른 세션의 문의는 조회하지 않는다. */
export default function SupportLoginHelpPage() {
  const location=useLocation();const [params,setParams]=useSearchParams();
  const raw=params.get("inquiry");const inquiryId=/^[1-9]\d*$/.test(raw||"")&&Number.isSafeInteger(Number(raw))?Number(raw):null;
  const [reload,setReload]=useState(0);const gate=useRequestGate(`${location.key}:${reload}`);
  const [session,setSession]=useState(null);const [result,setResult]=useState(null);const [before,setBefore]=useState(undefined);
  const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  useEffect(()=>{const current=gate.begin("session");setLoading(true);setError("");setSession(null);setResult(null);
    getGuestSupportSession().then(async data=>{if(!current())return;setSession(data);
      if(data.active&&!inquiryId){const page=await getSupportInquiries({guest:true,before});if(current())setResult(page);}
    }).catch(e=>{if(current())setError(supportError(e));}).finally(()=>{if(current())setLoading(false);});
  },[gate,inquiryId,before]);
  return <SupportLetterLayout backTo="/help" backLabel="도움말" {...(inquiryId?{title:"로그인 문의와 답변",description:"이 브라우저에서 접수한 문의를 확인해 주세요.",illustration:false}:{})}>
    {loading&&<p role="status" className="support-letter-state text-sm text-slate-500">이 브라우저의 문의를 확인하고 있어요.</p>}
    {error&&<p role="alert" className="support-letter-state rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}<button onClick={()=>setReload(n=>n+1)} className="ml-3 min-h-11 underline">다시 확인</button></p>}
    {!loading&&!error&&session?.active&&inquiryId?<div className="support-letter-card"><button type="button" onClick={()=>{setBefore(undefined);setParams({});}} className="mb-5 min-h-11 font-bold text-emerald-700">← 이 브라우저의 문의 목록</button><SupportInquiryDetail key={`guest:${inquiryId}:${location.key}`} inquiryId={inquiryId} guest/></div>:null}
    {!inquiryId&&<>
      <h2 className="sr-only">로그인 도움 문의 접수</h2><SupportComposer key={`guest:${location.key}`} guest onCreated={ticket=>setParams({inquiry:String(ticket.inquiryId)})}/>
    </>}
    <aside className="support-letter-notice" aria-label="로그인 도움 답변 확인 안내"><SupportLetterIcon name="info"/><div><strong>답변은 같은 브라우저에서 확인해 주세요.</strong><p>계정 로그인 없이 접수할 수 있어요. 문의 조회용 쿠키를 삭제하거나 다른 기기·브라우저를 사용하면 기존 문의를 확인할 수 없어요.</p></div></aside>
    {!inquiryId&&<>
      {session?.active&&<section className="support-letter-history space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">이 브라우저의 문의</h2><button onClick={()=>setReload(n=>n+1)} className="min-h-11 rounded-xl border px-4 text-sm font-bold">새로고침</button></div>
        {result?.items?.length===0&&<p className="rounded-xl bg-slate-50 p-4 text-sm">아직 접수한 로그인 도움 문의가 없어요.</p>}
        {result?.items?.map(ticket=><Link key={ticket.inquiryId} to={`?inquiry=${ticket.inquiryId}`} className="support-letter-card support-letter-ticket"><div className="flex flex-wrap justify-between gap-2"><span className="break-words font-bold">{supportTitle(ticket)}</span><SupportStatusBadge status={ticket.status}/></div></Link>)}
        <div className="flex gap-3"><button disabled={!before} onClick={()=>setBefore(undefined)} className="min-h-11 rounded-xl border px-4 disabled:opacity-40">처음으로</button><button disabled={!result?.nextBefore} onClick={()=>setBefore(result.nextBefore)} className="min-h-11 rounded-xl border px-4 disabled:opacity-40">다음</button></div>
      </section>}
    </>}
    {!loading&&!error&&inquiryId&&!session?.active&&<section className="rounded-xl bg-slate-50 p-5"><p>이 브라우저에서 해당 문의를 확인할 수 없어요. 조회 시간이 지났거나 문의 쿠키가 없는 상태예요.</p><button onClick={()=>setParams({})} className="mt-3 min-h-11 font-bold text-emerald-700 underline">새 로그인 도움 문의 접수</button></section>}
  </SupportLetterLayout>;
}
