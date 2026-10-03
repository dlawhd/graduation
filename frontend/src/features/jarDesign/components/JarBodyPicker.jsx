import { useState } from "react";
import { JAR_BODIES, JAR_BODY_COLLECTIONS, getJarBody } from "../jarBodies.mjs";
import JarBodyStage from "./JarBodyStage";

/** 서버 요청 없이 30종 본체를 비교하고, 선택한 고정 ID만 다음 단계로 전달한다. */
export default function JarBodyPicker({ value, onChange, onContinue, onImageOnly, disabled = false, previewUrl = "" }) {
  const [collection, setCollection] = useState("전체");
  const selected = getJarBody(value);
  const previewBody = selected || getJarBody("CLASSIC");
  const bodies = collection === "전체" ? JAR_BODIES : JAR_BODIES.filter((body) => body.collection === collection);
  return <section aria-label="저금통 모양 선택" className="mt-7 grid items-start gap-6 pb-20 lg:grid-cols-[minmax(0,1fr)_300px] lg:pb-0">
    <div>
      {onImageOnly && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4"><p className="text-sm text-stone-600">모양 없이 내 사진이나 그림 자체를 저금통으로 써도 좋아요.</p><button type="button" disabled={disabled} onClick={onImageOnly} className="min-h-11 rounded-xl bg-stone-100 px-4 text-sm font-bold text-stone-700">저금통 없이 이미지만 사용하기 →</button></div>}
      <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold tracking-[.25em] text-emerald-700">THE MEMORY ATELIER · 30 OBJECTS</p><h2 className="mt-2 text-xl font-black text-slate-800">어떤 모양에 마음이 가나요?</h2><p className="mt-2 text-sm leading-6 text-stone-500">밤하늘을 닮은 고양이, 숲속의 작은 집. 내 추억이 머물 오브제를 골라요.</p></div><span className="whitespace-nowrap text-sm text-slate-500">{bodies.length} / 30</span></div>
      <div className="mb-5 flex flex-wrap gap-2" aria-label="저금통 컬렉션 필터">
        {["전체", ...JAR_BODY_COLLECTIONS].map((name) => <button key={name} type="button" disabled={disabled} aria-pressed={collection === name} onClick={() => setCollection(name)} className={`min-h-11 rounded-full border px-4 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${collection === name ? "border-emerald-800 bg-emerald-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-emerald-400"}`}>{name}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {bodies.map((body) => <button key={body.id} type="button" disabled={disabled} aria-pressed={value === body.id} aria-label={`${body.name} · ${body.detail}`} onClick={() => onChange(body.id)} className={`group relative min-w-0 overflow-hidden rounded-[22px] border bg-[#fffdf9] text-left transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 ${value === body.id ? "border-emerald-600 shadow-[0_6px_20px_rgba(30,80,60,.12)] ring-2 ring-emerald-600/20" : "border-stone-200/80 hover:border-emerald-400 hover:shadow-md"}`}>
          <span className="absolute left-3 top-3 z-10 text-[9px] font-bold tracking-[.18em] text-stone-600">OBJECT {String(JAR_BODIES.indexOf(body) + 1).padStart(2, "0")}</span>
          {value === body.id && <span className="absolute right-2 top-2 z-10 rounded-full bg-emerald-800 px-2 py-1 text-[10px] font-bold text-white">선택 ✓</span>}
          <JarBodyStage body={body} imageUrl={previewUrl}/>
          <div className="border-t border-stone-200/50 px-3 py-4 sm:px-4"><h3 className="text-sm font-black text-slate-800">{body.name}</h3><p className="mt-1 min-h-10 text-[11px] leading-5 text-stone-500">{body.detail}</p><div aria-hidden="true" className="mt-2 flex items-center gap-1.5">{[body.colors.base,body.colors.shade,body.colors.accent].map((color) => <span key={color} className="h-2 w-2 rounded-full ring-1 ring-black/5" style={{ background:color }}/>)}</div></div>
        </button>)}
      </div>
    </div>
    <aside className="rounded-[28px] border border-white bg-[#fffdf8] p-5 shadow-[0_12px_40px_rgba(68,60,44,0.07)] lg:sticky lg:top-24">
      <div className="flex items-center justify-between"><p className="text-[10px] font-bold tracking-[.2em] text-emerald-800">YOUR LITTLE TREASURE</p><span className="text-[10px] text-stone-400">480 × 480</span></div>
      <JarBodyStage body={previewBody} imageUrl={previewUrl} alt={selected?.name || "클래식 저금통 예시"} className="mt-4 rounded-t-[100px] rounded-b-[22px] border border-stone-200/70"/>
      <div className="mt-5" aria-live="polite"><p className="text-xs text-stone-500">{selected?.collection || "30가지 모양, 하나뿐인 추억"}</p><h3 className="mt-2 text-xl font-black text-slate-800">{selected?.name || "마음에 드는 모양을 골라요"}</h3><p className="mt-3 min-h-12 text-sm leading-6 text-stone-600">{selected?.description || "모양을 누르면 크게 볼 수 있어요. 다음 단계에서 나만의 사진이나 그림을 담아주세요."}</p></div>
      {selected && <div className="mt-3 border-t border-stone-200 pt-3"><p className="text-[10px] font-bold tracking-widest text-stone-400">FINISH & DETAILS</p><p className="mt-1 text-xs leading-5 text-stone-600">{selected.material}</p></div>}
      <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-900">가운데 작은 일러스트는 미리보기예요. 다음 단계에서 내 사진이나 그림으로 채우고, 원하면 AI 스타일도 입힐 수 있어요.</p>
      <button type="button" onClick={onContinue} disabled={disabled || !selected} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-black text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-40">이 저금통에 그림 담기 →</button>
    </aside>
    {selected && <div className="fixed bottom-4 left-4 right-4 z-20 flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white/95 p-3 shadow-lg backdrop-blur lg:hidden"><span className="pl-1 text-sm font-black text-emerald-900">{selected.name}</span><button type="button" disabled={disabled} onClick={onContinue} className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white">그림 담기 →</button></div>}
  </section>;
}
