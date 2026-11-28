import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prepareSourceImage } from "../jarDesign/sourceImageFile.mjs";
import { SupportLetterIcon } from "./SupportLetterLayout";

const MAX_SUPPORT_ATTACHMENTS = 5;

/** 선택한 로컬 파일만 미리 보여준다. 제거/화면 종료 때 미리보기 URL을 해제한다. */
function Preview({file,alt="선택한 화면 자료 미리보기"}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const value=URL.createObjectURL(file);setUrl(value);return()=>URL.revokeObjectURL(value);},[file]);
  return url?<img src={url} alt={alt} loading="lazy" className="h-32 w-full rounded-xl bg-slate-50 object-contain"/>:null;
}
/** 파일 선택기가 가져온 후보를 보여주고 누른 순서대로 첨부 목록을 만든다. */
function ScreenshotSelection({candidates, remaining, onCancel, onConfirm}) {
  const dialog=useRef(null);
  const [order,setOrder]=useState([]);
  const [limitReached,setLimitReached]=useState(false);
  const selected=order.slice(0,remaining);
  const selectedIds=selected.map(item=>item.id);
  useEffect(()=>{
    const element=dialog.current;
    element.showModal();
    return ()=>element.close();
  },[]);

  function toggle(item) {
    if(selectedIds.includes(item.id)){
      setOrder(selected.filter(candidate=>candidate.id!==item.id));
      setLimitReached(false);
    }else if(selected.length>=remaining){
      setLimitReached(true);
    }else{
      setOrder([...selected,item]);
      setLimitReached(false);
    }
  }

  return createPortal(
    <dialog ref={dialog} aria-label="첨부할 사진 고르기"
      onCancel={event=>{event.preventDefault();onCancel();}}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,760px)] overflow-auto rounded-3xl border border-emerald-100 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45">
      <header className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <div><h2 className="text-xl font-black">첨부할 사진 고르기</h2><p className="mt-1 text-sm text-slate-600">누른 순서대로 첨부돼요.</p></div>
        <button type="button" aria-label="사진 선택 닫기" onClick={onCancel} className="h-11 w-11 shrink-0 rounded-xl text-xl hover:bg-slate-100">×</button>
      </header>
      <ul className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 sm:px-6">
        {candidates.map(item=>{
          const index=selectedIds.indexOf(item.id);
          return <li key={item.id} className="min-w-0">
            <button type="button" aria-pressed={index>=0} onClick={()=>toggle(item)}
              className={`relative block w-full rounded-xl border-2 p-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 ${index>=0?"border-emerald-800 bg-emerald-50":"border-slate-200 hover:border-emerald-500"}`}>
              <Preview file={item.file} alt=""/>
              <span className="mt-1 block truncate px-1 text-xs text-slate-700" title={item.file.name}>{item.file.name}</span>
              <span className={`absolute right-2 top-2 grid size-7 place-items-center rounded-full border border-emerald-800 text-sm font-bold ${index>=0?"bg-emerald-800 text-white":"bg-white/95"}`}>
                {index>=0&&<><span className="sr-only">첨부 순서 </span>{index+1}</>}
              </span>
            </button>
          </li>;
        })}
      </ul>
      <footer className="mt-5 border-t border-slate-200 bg-white p-5 sm:p-6">
        {limitReached&&<p role="alert" className="mb-2 text-xs text-rose-700">문의당 최대 {MAX_SUPPORT_ATTACHMENTS}개까지 첨부할 수 있어요. 다른 사진을 고르려면 선택을 먼저 취소해 주세요.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm font-semibold">최대 {remaining}개 중 {selected.length}개 선택</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold">취소</button>
            <button type="button" disabled={!selected.length} onClick={()=>onConfirm(selected)} className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">{selected.length}개 첨부하기</button>
          </div>
        </div>
      </footer>
    </dialog>,document.body
  );
}

/** 접수 전 첨부 내용 확인/제거를 지원한다. 서버에서도 크기·실제 이미지 내용·개수를 다시 검사한다. */
export default function SupportScreenshots({files,onChange,disabled=false,savedCount=0,onReadingChange,appearance="default"}) {
  const [candidates,setCandidates]=useState([]);
  const [error,setError]=useState("");const [reading,setReading]=useState(false);const selection=useRef(0);
  useEffect(()=>()=>{selection.current++;onReadingChange?.(false);},[]);
  const remaining = Math.max(0, MAX_SUPPORT_ATTACHMENTS - savedCount - files.length);
  async function choose(event) {
    const selected=Array.from(event.target.files||[]);event.target.value="";if(!selected.length)return;
    const version=++selection.current;setError("");setReading(true);onReadingChange?.(true);
    try {
      const prepared=[];
      const notices=[];
      for(const file of selected) {
        try {
          if(file.size>2*1024*1024)throw new Error("화면 자료는 파일당 2MB 이하여야 해요.");
          prepared.push({id:crypto.randomUUID(),requestId:crypto.randomUUID(),file:await prepareSourceImage(file),uploaded:false});
        } catch(e) {
          notices.push(`${file.name} 파일은 담지 못했어요. ${e.message || "파일을 읽지 못했어요."}`);
        }
      }
      if(version===selection.current){
        setCandidates(prepared);
        setError(notices.join(" "));
      }
    }catch(e){if(version===selection.current)setError(e.message||"화면 자료를 읽지 못했어요.");}
    finally{if(version===selection.current){setReading(false);onReadingChange?.(false);}}
  }
  function confirmSelection(selected) {
    onChange(previous=>[...previous,...selected.slice(0,Math.max(0,MAX_SUPPORT_ATTACHMENTS-savedCount-previous.length))]);
    setCandidates([]);
  }
  const letter=appearance==="letter",unavailable=disabled||reading||remaining===0;
  return <section className={`space-y-3${letter?" support-letter-attachments":""}`} aria-label="선택 화면 첨부">
    {savedCount<MAX_SUPPORT_ATTACHMENTS&&<label className={letter?`support-letter-file-label${unavailable?" is-disabled":""}`:"block text-sm font-bold"}>
      <span>{letter?"화면 캡처 첨부":"화면 자료 첨부"} <span className={letter?"support-letter-file-optional":"font-normal text-slate-500"}>{letter?"(선택)":"선택 사항"}</span></span>
      {letter&&<><span className="support-letter-file-button"><SupportLetterIcon name="attachment"/>{reading?"확인 중…":"파일 선택"}</span><span className="support-letter-file-limit">{remaining}개 더 선택 가능 (파일당 2MB 이하)</span></>}
      <input aria-label="화면 자료 선택" type="file" multiple accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        disabled={unavailable} onChange={event=>void choose(event)} className={letter?"sr-only":"mt-2 block w-full rounded-xl border border-slate-200 p-3 text-xs"}/>
    </label>}
    <p className="text-xs leading-5 text-slate-500">{savedCount>=MAX_SUPPORT_ATTACHMENTS
      ? `화면 자료가 이미 ${MAX_SUPPORT_ATTACHMENTS}개 첨부되어 있어요.`
      : `PNG, JPEG, WebP 파일을 문의당 최대 ${MAX_SUPPORT_ATTACHMENTS}개까지 첨부할 수 있어요. 파일당 2MB 이하로 올려 주세요. 개인정보가 보이면 가린 뒤 첨부해 주세요.`}</p>
    {candidates.length>0&&<ScreenshotSelection candidates={candidates} remaining={remaining} onCancel={()=>setCandidates([])} onConfirm={confirmSelection}/>}
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    <ul className="grid gap-3 sm:grid-cols-3">{files.map((item,index)=><li key={item.id} className="min-w-0 rounded-xl border border-slate-200 p-2">
      <p className="mb-1 text-xs font-bold text-emerald-800">첨부 {index+1}</p><Preview file={item.file}/><p className="mt-2 break-all text-xs text-slate-500">{item.file.name} ({Math.ceil(item.file.size/1024)}KB)</p>
      {item.uploaded?<p role="status" className="mt-2 text-xs font-bold text-emerald-700">첨부 완료</p>:<button type="button" disabled={disabled} onClick={()=>onChange(previous=>previous.filter(file=>file.id!==item.id))} className="mt-2 min-h-11 w-full rounded-lg bg-slate-100 text-sm">선택 취소</button>}
    </li>)}</ul>
  </section>;
}
