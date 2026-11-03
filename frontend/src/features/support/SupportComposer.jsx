import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createGeneralSupportInquiry, uploadSupportScreenshot, supportError } from "../../api/supportApi";
import { useRequestGate } from "../../api/useRequestGate";
import { SUPPORT_CATEGORIES } from "./supportContext.mjs";
import SupportScreenshots from "./SupportScreenshots";
import { SupportLetterIcon } from "./SupportLetterLayout";

/** 문의 내용은 한 번만 접수하고, 첨부만 실패했을 때는 기존 접수에 첨부를 다시 시도한다. */
export default function SupportComposer({guest=false,context={},userId,onCreated}) {
  const location=useLocation();const gate=useRequestGate(`${guest?"guest":userId}:${location.key}`);
  const [category,setCategory]=useState(guest?"LOGIN_ACCOUNT":context.jarId?"THREE_D":"OTHER");
  const [title,setTitle]=useState("");const [description,setDescription]=useState("");const [includeContext,setIncludeContext]=useState(true);
  const [files,setFiles]=useState([]);const [shared,setShared]=useState(false);const [ticket,setTicket]=useState(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const pending=useRef(false);
  const filePending=useRef(false);const [fileReading,setFileReading]=useState(false);
  const [occurredAt]=useState(()=>new Date().toISOString());
  const attempted=useRef({fingerprint:null,id:null});
  async function submit(event) {
    event.preventDefault();if(pending.current||filePending.current||!title.trim()||!description.trim()||(files.some(f=>!f.uploaded)&&!shared))return;
    pending.current=true;setBusy(true);setError("");const current=gate.begin("submit");
    try {
      let saved=ticket;
      if(!saved) {
        const payload={category,title:title.trim(),description:description.trim(),...(!guest&&includeContext&&Object.keys(context).length?{...context,occurredAt:context.occurredAt||occurredAt}:{})};
        const fingerprint=JSON.stringify(payload);
        if(attempted.current.fingerprint!==fingerprint)attempted.current={fingerprint,id:crypto.randomUUID()};
        saved=await createGeneralSupportInquiry({...payload,requestId:attempted.current.id},{guest});
        if(!current())return;setTicket(saved);
      }
      for(const item of files.filter(file=>!file.uploaded)) {
        try {
          await uploadSupportScreenshot(saved.inquiryId,item.file,item.requestId,{guest});
          if(!current())return;
          setFiles(previous=>previous.map(file=>file.id===item.id?{...file,uploaded:true}:file));
        }catch(uploadError) {
          if(!current())return;
          // 명확하게 실패한 재시도는 새 식별자를 쓴다. 처리 중 409에서는 같은 요청의 결과를 기다린다.
          if(uploadError?.response?.status!==409)setFiles(previous=>previous.map(file=>file.id===item.id?{...file,requestId:crypto.randomUUID()}:file));
          throw new Error(`문의 #${saved.inquiryId}는 접수됐지만 일부 첨부가 완료되지 않았어요. ${supportError(uploadError)}`);
        }
      }
      if(current())onCreated(saved);
    }catch(e){if(current())setError(e?.response?supportError(e):e.message||"문의를 접수하지 못했어요.");}
    finally{if(current()){pending.current=false;setBusy(false);}}
  }
  const locked=busy||Boolean(ticket),base=guest?"/support/login-help?inquiry=":"/support/inquiries/";
  return <form onSubmit={event=>void submit(event)} className="support-letter-form">
    {/* 비로그인 문의는 로그인 도움 전용이므로 선택할 수 없는 유형을 드롭다운으로 표시하지 않는다. */}
    {guest?<div className="support-letter-category">
      <p><span className="sr-only">문의 유형: </span><span>{SUPPORT_CATEGORIES.LOGIN_ACCOUNT}</span></p>
      <p className="text-sm leading-6 text-slate-500">로그인에 어려움이 있는 상황을 알려주세요. 다른 문의는 로그인 후 ‘내 문의’에서 접수할 수 있어요.</p>
    </div>:<label className="support-letter-label">문의 유형<select aria-label="문의 유형" disabled={locked} value={category} onChange={e=>setCategory(e.target.value)} className="support-letter-select">{Object.entries(SUPPORT_CATEGORIES).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>}
    <label className="support-letter-label">제목<input aria-label="문의 제목" required maxLength={100} disabled={locked} value={title} onChange={e=>setTitle(e.target.value)} placeholder="문의 제목을 입력해 주세요." className="support-letter-title"/></label>
    <div><label className="support-letter-label">문의 내용<textarea aria-label="문의 내용" required maxLength={1000} rows={5} disabled={locked} value={description} onChange={e=>setDescription(e.target.value)} placeholder="겪고 계신 어려움이나 궁금한 점을 자세히 알려주세요." className="support-letter-description"/></label>
    <p className="support-letter-count">{description.length} / 1,000자</p></div>
    {!guest&&Object.keys(context).length>0&&<label className="block rounded-xl bg-slate-50 p-4 text-sm leading-6"><input type="checkbox" disabled={locked} checked={includeContext} onChange={e=>setIncludeContext(e.target.checked)} className="mr-2"/>문제가 발생한 화면 정보 함께 보내기
      <span className="mt-1 block break-words text-xs text-slate-500">{context.contextPath||""}{context.jarId?` · 저금통 #${context.jarId}`:""}{context.draftId?` · 디자인 #${context.draftId}`:""}{context.errorCode?` · 화면 오류 코드 ${context.errorCode}`:""} · 쪽지·대화 내용과 사진은 자동 첨부하지 않아요.</span></label>}
    <SupportScreenshots appearance="letter" files={files} onChange={setFiles} disabled={busy} onReadingChange={value=>{filePending.current=value;setFileReading(value);}}/>
    {files.some(f=>!f.uploaded)&&<label className="block text-sm leading-6"><input type="checkbox" checked={shared} disabled={busy} onChange={e=>setShared(e.target.checked)} className="mr-2"/>선택한 화면 자료를 문의 확인을 위해 운영자에게 공유하는 데 동의해요.</label>}
    <p className="support-letter-privacy"><SupportLetterIcon name="shield"/><span>비밀번호와 인증번호는 적지 마세요.</span></p>
    <p className="support-letter-retention">첨부는 최대 30일, 내용과 추가 대화는 접수부터 90일 보관해요. 첨부가 실패해도 이미 접수된 내용은 유지돼요.</p>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {ticket&&<p role="status" className="text-sm text-emerald-800">문의 #{ticket.inquiryId} 접수 완료 · <Link to={base+ticket.inquiryId} className="font-bold underline">첨부를 건너뛰고 문의 보기</Link></p>}
    <button type="submit" disabled={busy||fileReading||!title.trim()||!description.trim()||(files.some(f=>!f.uploaded)&&!shared)} className="support-letter-submit">{busy?"문의와 화면 자료를 저장하고 있어요…":fileReading?"화면 자료를 확인하고 있어요…":ticket?"남은 첨부 다시 시도":"문의 접수하기"}</button>
  </form>;
}
