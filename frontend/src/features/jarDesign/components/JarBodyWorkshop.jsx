import { useState } from "react";
import { basicBodyOutline, customJarBody } from "../customJarBody.mjs";
import CustomJarBodyArtwork from "./CustomJarBodyArtwork";
import JarDesignCanvas from "./JarDesignCanvas";
import CustomJarBodyViewer from "./CustomJarBodyViewer";
import "../bodyWorkshop.css";

/** 틀 그림판의 원본 색과 꾸밈을 유지하고 사진 그림판과 분리해 편집한다. */
export default function JarBodyWorkshop({ value, onChange, onContinue, onOpenCatalog, onImageOnly, disabled=false, previewUrl="" }) {
  const [working,setWorking]=useState(false);
  const locked=disabled || working;
  const outline=value || {points:[],color:"#d7e9df"},body=customJarBody(outline);
  const basicTemplates = <div className="studio-basic-section" role="group" aria-label="꾸밈없는 기본 틀에서 시작하기"><h3 className="mb-3 text-sm font-black text-slate-800">기본 틀</h3><div className="grid grid-cols-3 gap-2">{[["ROUND","둥근 틀"],["JAR","병 모양 틀"],["SQUARE","네모 틀"]].map(([kind,label])=><button key={kind} type="button" disabled={locked} onClick={()=>onChange(basicBodyOutline(kind,outline.color))} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-1 text-xs font-bold text-slate-600">
    <svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true"><path d={"M"+basicBodyOutline(kind).points.map(p=>`${p.x*48} ${p.y*48}`).join("L")+"Z"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>{label}
  </button>)}</div><p className="mt-2 text-[11px] leading-5 text-slate-500">기본 틀은 지금 모양을 바꿔요. 실행 취소로 되돌릴 수 있어요.</p></div>;
  return <section aria-label="저금통 틀 공방" className="body-workshop mt-6">
    <h2 className="sr-only">저금통 틀 만들기 작업 공간</h2>
    <div className="studio-workspace">
      <div className="studio-editor min-w-0">
        {/* 기존 사진 그림판을 재사용하되 픽셀 원본과 틀 좌표는 별도로 보관한다. */}
        <JarDesignCanvas purpose="BODY" workshopLayout toolboxHeader={basicTemplates} bodyValue={value} onBodyChange={onChange} onWorkingChange={setWorking} disabled={disabled} onConfirm={onContinue}/>
      </div>
      <aside className="studio-preview rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-base font-black text-slate-800"> 틀 미리보기</h3><div className="mt-4 aspect-square rounded-2xl bg-[#f3f7f5]">{body?<CustomJarBodyViewer customBody={outline} imageUrl={previewUrl} outlineOnly disabled={locked}><CustomJarBodyArtwork customBody={outline} imageUrl={previewUrl} outlineOnly alt="직접 만든 틀 미리보기"/></CustomJarBodyViewer>:<div className="flex h-full items-center justify-center px-5 text-center text-sm leading-7 text-stone-400">모양을 만들면<br/>여기에 함께 보여요.</div>}</div><p className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-6 text-slate-600">{previewUrl?"틀 안에 담긴 사진을 미리 보여드려요. 다음 단계에서 사진 위치와 확대를 조절할 수 있어요.":"사진과 그림은 다음 단계에서 담아요."}</p><details className="mt-3 text-xs leading-6 text-slate-500"><summary className="cursor-pointer font-bold">3D 미리보기 안내</summary><p>틀에 두께를 붙여 돌려볼 수 있어요. 사진 속 인물을 입체로 만드는 기능은 아니에요.</p></details><p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold leading-6 text-emerald-800">{working?"그리는 중이에요. 손을 떼면 미리보기에 반영돼요.":body?"✓ 틀이 완성되었어요. 다음 단계로 갈 수 있어요.":"모양을 만들거나 기본 틀을 골라주세요."}</p><button type="button" disabled={locked||!body} onClick={onContinue} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-800 px-4 text-sm font-black text-white disabled:opacity-40">그림 또는 이미지 담기 →</button><div className="mt-4 grid gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={locked} onClick={onOpenCatalog} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600">준비된 저금통에서 고르기</button><button type="button" disabled={locked} onClick={onImageOnly} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600">이미지만 사용하기</button></div></aside>
    </div>
    <p className="mt-5 text-center text-xs leading-6 text-slate-500">내가 그린 색과 테두리는 그대로.. 소중한 추억은 그 안에..</p>
  </section>;
}
