import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getSupportView, getSupportMessages, getSupportImage, startSupportReview,
  sendSupportMessage, resolveSupportInquiry, uploadSupportScreenshot, getSupportAttachmentImage, supportError } from "../../api/supportApi";
import { useRequestGate } from "../../api/useRequestGate";
import { SUPPORT_STYLE, supportTime } from "./supportView.mjs";
import { SUPPORT_CATEGORIES, supportTitle } from "./supportContext.mjs";
import SupportStatusBadge from "./SupportStatusBadge";
import SupportScreenshots from "./SupportScreenshots";

/** 내 문의와 운영자 상세에서 같은 내용을 표시한다. 사진은 사용자가 열기를 눌러야 요청한다. */
export default function SupportInquiryDetail({ inquiryId, operator = false, guest=false, onUpdated }) {
  const location=useLocation();const [refresh,setRefresh]=useState(0);
  const gate=useRequestGate(`${inquiryId}:${operator}:${guest}:${location.key}:${refresh}`);
  const [ticket,setTicket]=useState(null),[messages,setMessages]=useState([]),[nextBefore,setNextBefore]=useState(null);
  const [attachments,setAttachments]=useState([]),[previews,setPreviews]=useState({}),[image,setImage]=useState(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [historyBusy,setHistoryBusy]=useState(false),[previewBusy,setPreviewBusy]=useState({});
  const [content,setContent]=useState(""),[waiting,setWaiting]=useState(false),[files,setFiles]=useState([]),[shared,setShared]=useState(false);
  const inFlight=useRef(false),imageInFlight=useRef(new Set()),attempted=useRef({key:null,id:null});
  const filePending=useRef(false),updatedPending=useRef(false),updatedCallback=useRef(onUpdated);
  updatedCallback.current=onUpdated;
  const [fileReading,setFileReading]=useState(false);
  const mode={operator,guest};
  useLayoutEffect(()=>{inFlight.current=false;imageInFlight.current.clear();setBusy(false);setHistoryBusy(false);setPreviewBusy({});},[gate]);
  useEffect(()=>{
    const controller=new AbortController(),current=gate.begin("view");setLoading(true);setError("");setTicket(null);setMessages([]);setAttachments([]);setPreviews({});setImage(null);setNextBefore(null);
    getSupportView(inquiryId,{operator,guest,signal:controller.signal}).then(data=>{if(!current())return;
      setTicket(data.inquiry);setMessages(data.messages?.items||[]);setNextBefore(data.messages?.nextBefore||null);setAttachments(data.attachments||[]);
      if(updatedPending.current){updatedPending.current=false;updatedCallback.current?.(data.inquiry);}
    }).catch(e=>{if(current())setError(supportError(e));}).finally(()=>{if(current())setLoading(false);});
    return()=>controller.abort();
  },[gate,inquiryId,operator,guest]);
  // 이미 발급된 URL은 즉시 철회할 수 없으므로 화면에서도 1분 뒤 지우고 새 발급을 요구한다.
  useEffect(()=>{
    const expiry=[image?.until,...Object.values(previews).map(p=>p.until)].filter(Boolean);if(!expiry.length)return;
    const timer=setTimeout(()=>{const now=Date.now();setImage(p=>p&&p.until>now?p:null);setPreviews(p=>Object.fromEntries(Object.entries(p).filter(([,v])=>v.until>now)));},Math.max(1,Math.min(...expiry)-Date.now()));
    return()=>clearTimeout(timer);
  },[image,previews]);
  async function mutate(action) {
    if(inFlight.current||filePending.current)return;inFlight.current=true;setBusy(true);setError("");const current=gate.begin("write");
    try {await action(current);if(current()){updatedPending.current=true;setRefresh(n=>n+1);}}
    catch(e){if(current())setError(supportError(e));}
    finally{if(current()){inFlight.current=false;setBusy(false);}}
  }
  async function addMessage(current) {
    for(const item of files.filter(f=>!f.uploaded)) {
      try {await uploadSupportScreenshot(inquiryId,item.file,item.requestId,mode);if(!current())return;setFiles(previous=>previous.map(f=>f.id===item.id?{...f,uploaded:true}:f));}
      catch(e){if(current()&&e?.response?.status!==409)setFiles(previous=>previous.map(f=>f.id===item.id?{...f,requestId:crypto.randomUUID()}:f));throw e;}
    }
    if(!current())return;
    const text=content.trim()||"화면 자료를 추가했어요.",key=JSON.stringify({text,waiting:operator&&waiting});
    if(attempted.current.key!==key)attempted.current={key,id:crypto.randomUUID()};
    await sendSupportMessage(inquiryId,{content:text,requestId:attempted.current.id,waitingForUser:operator&&waiting},mode);
    if(current()){setContent("");setFiles([]);setShared(false);setWaiting(false);attempted.current={key:null,id:null};}
  }
  async function older() {
    if(!nextBefore||historyBusy)return;setHistoryBusy(true);const current=gate.begin("older");
    try {const page=await getSupportMessages(inquiryId,{...mode,before:nextBefore});if(current()){setMessages(previous=>Array.from(new Map([...previous,...page.items].map(m=>[m.messageId,m])).values()));setNextBefore(page.nextBefore||null);}}
    catch(e){if(current())setError(supportError(e));}finally{if(current())setHistoryBusy(false);}
  }
  async function openImage(id) {
    const key=id==null?"original":String(id);if(imageInFlight.current.has(key))return;
    imageInFlight.current.add(key);setPreviewBusy(p=>({...p,[key]:true}));const current=gate.begin(`image:${key}`);
    try {const data=id==null?await getSupportImage(inquiryId,operator):await getSupportAttachmentImage(inquiryId,id,mode);
      if(current()){const preview={url:data.previewUrl,until:Math.min(Date.now()+60000,Date.parse(data.expiresAt)||Date.now()+60000)};
        if(id==null)setImage(preview);else setPreviews(p=>({...p,[key]:preview}));}
    }catch(e){if(current())setError(supportError(e));}
    finally{if(current()){imageInFlight.current.delete(key);setPreviewBusy(p=>({...p,[key]:false}));}}
  }
  const button="support-letter-action is-soft";
  const canAct=ticket&&!ticket.contentExpired&&!["COPYING","COPY_FAILED"].includes(ticket.status),resolved=ticket?.status==="RESOLVED";
  const chronological=[...messages].sort((a,b)=>a.messageId-b.messageId);
  return <section aria-label="문의 상세" className="support-letter-detail space-y-5">
    <div className="flex justify-end"><button type="button" disabled={loading||busy} onClick={()=>setRefresh(n=>n+1)} className={button}>새로고침</button></div>
    {loading&&<p role="status" className="text-sm text-slate-500">문의 내용을 불러오고 있어요.</p>}
    {error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}<button type="button" onClick={()=>setRefresh(n=>n+1)} className="ml-3 min-h-11 underline">다시 확인</button></div>}
    {ticket&&<>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="break-words text-xl font-black">{supportTitle(ticket)}</h2><SupportStatusBadge status={ticket.status}/></div>
      <dl className="support-letter-metadata grid gap-3 rounded-2xl p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">문의 번호·유형</dt><dd className="mt-1 font-semibold">#{ticket.inquiryId} · {SUPPORT_CATEGORIES[ticket.category]||"AI 생성·결과 품질"}</dd></div><div><dt className="text-xs text-slate-500">접수 시각</dt><dd className="mt-1">{supportTime(ticket.createdAt)}</dd></div>
        {ticket.generationId&&<><div><dt className="text-xs text-slate-500">선택한 스타일·실패한 후보</dt><dd className="mt-1 font-semibold">{SUPPORT_STYLE[ticket.style]||ticket.style} / #{ticket.generationId}</dd></div><div><dt className="text-xs text-slate-500">발생 시각·확인 코드</dt><dd className="mt-1">{supportTime(ticket.failedAt)} / {ticket.errorCode}</dd></div></>}
        {ticket.contextPath&&!ticket.contentExpired&&<div className="sm:col-span-2"><dt className="text-xs text-slate-500">연결한 문제 화면</dt><dd className="mt-1 break-words">{ticket.contextPath}{ticket.contextJarId?` · 저금통 #${ticket.contextJarId}`:""}{ticket.draftId?` · 디자인 #${ticket.draftId}`:""}</dd></div>}
        {operator&&ticket.model&&<div className="sm:col-span-2"><dt className="text-xs text-slate-500">서버 생성 기록</dt><dd className="mt-1 break-all text-xs">{ticket.model} / {ticket.promptVersion} / Draft #{ticket.draftId}</dd></div>}
        {ticket.clientErrorCode&&!ticket.contentExpired&&<div className="sm:col-span-2"><dt className="text-xs text-slate-500">문의자가 연결한 화면 정보</dt><dd className="mt-1 break-words">{ticket.clientErrorCode} · {supportTime(ticket.occurredAt)}</dd></div>}
      </dl>
      {ticket.contentExpired?<p className="text-sm text-slate-500">문의 내용과 대화는 90일 보관 기간이 지나 삭제되었습니다.</p>:<div><h3 className="mb-2 text-sm font-bold">처음 남긴 문의</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{ticket.description}</p></div>}
      {ticket.imageAvailable&&<div className="rounded-2xl border p-4"><p className="font-bold">공유한 원본 이미지</p><p className="mt-1 text-xs text-slate-500">{supportTime(ticket.imageExpiresAt)}까지 보관해요. 열람 주소는 최대 1분 후 만료돼요.</p><button disabled={previewBusy.original} onClick={()=>image?setImage(null):void openImage(null)} className={button+" mt-3"}>{image?"원본 이미지 닫기":previewBusy.original?"사진 확인 중…":"원본 이미지 보기"}</button>{image&&<img src={image.url} alt="문의 접수 시 공유한 원본" referrerPolicy="no-referrer" className="mt-4 max-h-80 w-full rounded-xl object-contain" onError={()=>{setImage(null);setError("사진 주소가 만료되었거나 파일을 읽지 못했어요. 다시 열어 주세요.");}}/>}</div>}
      {attachments.length>0&&<section aria-label="보관한 화면 자료" className="space-y-3"><h3 className="font-bold">보관한 화면 자료</h3>{attachments.map(a=><div key={a.attachmentId} className="rounded-xl border p-4"><p className="text-xs text-slate-500">자료 #{a.attachmentId} · {supportTime(a.expiresAt)}까지</p><button disabled={previewBusy[a.attachmentId]} onClick={()=>previews[a.attachmentId]?setPreviews(p=>{const next={...p};delete next[a.attachmentId];return next;}):void openImage(a.attachmentId)} className={button+" mt-2"}>{previews[a.attachmentId]?"자료 닫기":"화면 자료 보기"}</button>{previews[a.attachmentId]&&<img src={previews[a.attachmentId].url} alt={`공유한 화면 자료 ${a.attachmentId}`} referrerPolicy="no-referrer" className="mt-3 max-h-96 w-full object-contain" onError={()=>{setPreviews(p=>{const next={...p};delete next[a.attachmentId];return next;});setError("자료 주소가 만료되었어요. 다시 열어 주세요.");}}/>}</div>)}</section>}
      {!ticket.contentExpired&&<section aria-label="문의 대화" className="space-y-3"><h3 className="font-bold">추가 대화</h3>{nextBefore&&<button disabled={historyBusy} onClick={()=>void older()} className={button}>{historyBusy?"대화 확인 중…":"이전 대화 20개 보기"}</button>}
        {chronological.map(m=><article key={m.messageId} className={`support-letter-message rounded-2xl p-4${m.role==="OPERATOR"?" is-operator":""}`}><div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><strong>{m.role==="OPERATOR"?"운영자":"문의자"}</strong><time>{supportTime(m.createdAt)}</time></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{m.content}</p></article>)}
        {!messages.length&&ticket.reply&&<article className="support-letter-message is-operator rounded-2xl p-4"><h4 className="font-bold">운영자 답변</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{ticket.reply}</p></article>}
        {!messages.length&&!ticket.reply&&<p className="text-sm text-slate-500">추가 대화가 아직 없어요.</p>}
      </section>}
      {ticket.status==="COPY_FAILED"&&<p className="text-sm text-rose-700">원본 보관에 실패하여 접수되지 않았습니다. 정리가 끝난 뒤 실패한 후보에서 다시 접수해 주세요.</p>}
      {canAct&&<div className="flex flex-wrap gap-3 border-t pt-5">{resolved?<><p className="w-full text-sm text-emerald-800">해결된 문의예요. 문제가 계속되면 다시 열고 설명을 이어갈 수 있어요.</p><button disabled={busy} onClick={()=>void mutate(()=>resolveSupportInquiry(inquiryId,false,mode))} className={button}>아직 문제가 있어요 · 다시 문의</button></>:<><button disabled={busy} onClick={()=>void mutate(()=>resolveSupportInquiry(inquiryId,true,mode))} className={button}>해결됐어요</button>{operator&&ticket.status==="OPEN"&&<button disabled={busy} onClick={()=>void mutate(()=>startSupportReview(inquiryId))} className={button}>확인 중으로 변경</button>}</>}</div>}
      {canAct&&!resolved&&<form onSubmit={e=>{e.preventDefault();if((content.trim()||files.length)&&(!files.some(f=>!f.uploaded)||shared))void mutate(addMessage);}} className="support-letter-reply space-y-3 rounded-2xl p-4">
        <label className="support-letter-label">{operator?"운영자 답변":"내용 추가"}<textarea aria-label={operator?"운영자 답변":"추가 문의 내용"} disabled={busy} rows={5} maxLength={3000} value={content} onChange={e=>setContent(e.target.value)} className="support-letter-description"/></label><p className="text-right text-xs text-slate-500">{content.length} / 3,000자</p>
        {operator&&<label className="block text-sm"><input type="checkbox" checked={waiting} disabled={busy} onChange={e=>setWaiting(e.target.checked)} className="mr-2"/>문의자에게 추가 정보가 필요해요</label>}
        <SupportScreenshots appearance="letter" files={files} onChange={setFiles} disabled={busy} maxCount={Math.max(0,3-attachments.length)} onReadingChange={value=>{filePending.current=value;setFileReading(value);}}/>
        {files.some(f=>!f.uploaded)&&<label className="block text-sm leading-6"><input type="checkbox" checked={shared} disabled={busy} onChange={e=>setShared(e.target.checked)} className="mr-2"/>선택한 화면 자료 공유에 동의해요.</label>}
        <button type="submit" disabled={busy||fileReading||(!content.trim()&&!files.length)||(files.some(f=>!f.uploaded)&&!shared)} className="support-letter-action is-primary">{busy?"저장 중…":fileReading?"화면 자료 확인 중…":operator?"답변 보내기":"내용 보내기"}</button>
      </form>}
    </>}
  </section>;
}
