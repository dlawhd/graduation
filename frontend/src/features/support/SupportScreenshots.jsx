import { useEffect, useRef, useState } from "react";
import { prepareSourceImage } from "../jarDesign/sourceImageFile.mjs";

/** 선택한 로컬 파일만 미리 보여준다. 제거/화면 종료 때 미리보기 URL을 해제한다. */
function Preview({file}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const value=URL.createObjectURL(file);setUrl(value);return()=>URL.revokeObjectURL(value);},[file]);
  return url?<img src={url} alt="선택한 화면 자료 미리보기" className="h-32 w-full rounded-xl bg-slate-50 object-contain"/>:null;
}
/** 접수 전 첨부 내용 확인/제거를 지원한다. 서버에서도 크기·실제 이미지 내용·개수를 다시 검사한다. */
export default function SupportScreenshots({files,onChange,disabled=false,maxCount=3,onReadingChange}) {
  const [error,setError]=useState("");const [reading,setReading]=useState(false);const selection=useRef(0);
  useEffect(()=>()=>{selection.current++;onReadingChange?.(false);},[]);
  async function choose(event) {
    const selected=Array.from(event.target.files||[]);event.target.value="";if(!selected.length)return;
    const version=++selection.current;setError("");setReading(true);onReadingChange?.(true);
    try {
      if(files.length+selected.length>maxCount)throw new Error(`이 문의에 추가할 수 있는 화면 자료는 ${maxCount}개예요.`);
      const prepared=[];
      for(const file of selected) {
        if(file.size>2*1024*1024)throw new Error("화면 자료는 파일당 2MB 이하여야 해요.");
        prepared.push({id:crypto.randomUUID(),requestId:crypto.randomUUID(),file:await prepareSourceImage(file),uploaded:false});
      }
      if(version===selection.current)onChange(previous=>[...previous,...prepared].slice(0,maxCount));
    }catch(e){if(version===selection.current)setError(e.message||"화면 자료를 읽지 못했어요.");}
    finally{if(version===selection.current){setReading(false);onReadingChange?.(false);}}
  }
  return <section className="space-y-3" aria-label="선택 화면 첨부">
    <label className="block text-sm font-bold">화면 자료 첨부 <span className="font-normal text-slate-500">선택 사항</span>
      <input aria-label="화면 자료 선택" type="file" multiple accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        disabled={disabled||reading||files.length>=maxCount} onChange={event=>void choose(event)} className="mt-2 block w-full rounded-xl border border-slate-200 p-3 text-xs"/>
    </label>
    <p className="text-xs leading-5 text-slate-500">문의당 최대 3개, 파일당 2MB 이하의 PNG·JPEG·WebP를 첨부할 수 있어요. 선택한 화면을 확인하고 개인정보가 보이면 지우거나 가린 뒤 첨부해 주세요.</p>
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    <ul className="grid gap-3 sm:grid-cols-3">{files.map(item=><li key={item.id} className="min-w-0 rounded-xl border border-slate-200 p-2">
      <Preview file={item.file}/><p className="mt-2 break-all text-xs text-slate-500">{item.file.name} · {Math.ceil(item.file.size/1024)}KB</p>
      {item.uploaded?<p role="status" className="mt-2 text-xs font-bold text-emerald-700">첨부 완료</p>:<button type="button" disabled={disabled} onClick={()=>onChange(previous=>previous.filter(file=>file.id!==item.id))} className="mt-2 min-h-11 w-full rounded-lg bg-slate-100 text-sm">선택 취소</button>}
    </li>)}</ul>
  </section>;
}
