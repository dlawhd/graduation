import { useState } from "react";
import { JAR_BODIES, JAR_BODY_COLLECTIONS, getJarBody } from "../jarBodies.mjs";
import JarBodyArtwork from "./JarBodyArtwork";

/** 서버 요청 없이 30종 본체를 비교하고, 선택한 고정 ID만 다음 단계로 전달한다. */
export default function JarBodyPicker({ value, onChange, onContinue, disabled = false, previewUrl = "" }) {
  const [collection, setCollection] = useState("전체");
  const selected = getJarBody(value);
  const bodies = collection === "전체" ? JAR_BODIES : JAR_BODIES.filter((body) => body.collection === collection);
  return <section aria-label="저금통 모양 선택" className="mt-7 grid items-start gap-6 pb-20 lg:grid-cols-[minmax(0,1fr)_300px] lg:pb-0">
    <div>
      <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold tracking-[.18em] text-emerald-700">THE OBJECT COLLECTION</p><h2 className="mt-2 text-xl font-black text-slate-800">어떤 모양에 마음이 가나요?</h2></div><span className="whitespace-nowrap text-sm text-slate-500">{bodies.length} / 30</span></div>
      <div className="mb-5 flex flex-wrap gap-2" aria-label="저금통 컬렉션 필터">
        {["전체", ...JAR_BODY_COLLECTIONS].map((name) => <button key={name} type="button" disabled={disabled} aria-pressed={collection === name} onClick={() => setCollection(name)} className={`min-h-11 rounded-full border px-4 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${collection === name ? "border-emerald-800 bg-emerald-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-emerald-400"}`}>{name}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {bodies.map((body) => <button key={body.id} type="button" disabled={disabled} aria-pressed={value === body.id} onClick={() => onChange(body.id)} className={`group relative min-w-0 overflow-hidden rounded-[22px] border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 ${value === body.id ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-600/20" : "border-white bg-white/80 hover:border-emerald-300 hover:bg-white"}`}>
          <span className="absolute left-3 top-3 z-10 text-[10px] font-bold tracking-widest text-stone-400">{String(JAR_BODIES.indexOf(body) + 1).padStart(2, "0")}</span>
          {value === body.id && <span className="absolute right-2 top-2 z-10 rounded-full bg-emerald-800 px-2 py-1 text-[10px] font-bold text-white">선택 ✓</span>}
          <JarBodyArtwork bodyStyle={body.id} imageUrl={previewUrl} alt={body.name} showDefaultSlot className="mx-auto w-full" />
          <div className="px-3 pb-4 sm:px-4"><h3 className="text-sm font-black text-slate-800">{body.name}</h3><p className="mt-1 text-[11px] leading-5 text-stone-500">{body.material}</p></div>
        </button>)}
      </div>
    </div>
    <aside className="rounded-[28px] border border-white bg-[#fffdf8] p-5 shadow-[0_12px_40px_rgba(68,60,44,0.07)] lg:sticky lg:top-24">
      <p className="text-xs font-bold tracking-widest text-emerald-800">YOUR LITTLE TREASURE</p>
      <div className="mt-4 rounded-[22px] bg-gradient-to-b from-[#eee9df] to-[#fbf8f1]"><JarBodyArtwork bodyStyle={selected?.id || "CLASSIC"} imageUrl={previewUrl} alt={selected?.name || "클래식 저금통 예시"} showDefaultSlot className="w-full" /></div>
      <div className="mt-5" aria-live="polite"><p className="text-xs text-stone-500">{selected?.collection || "30가지 모양, 하나뿐인 추억"}</p><h3 className="mt-2 text-xl font-black text-slate-800">{selected?.name || "마음에 드는 모양을 골라요"}</h3><p className="mt-3 min-h-12 text-sm leading-6 text-stone-600">{selected?.description || "모양을 누르면 크게 볼 수 있어요. 다음 단계에서 나만의 사진이나 그림을 담아주세요."}</p></div>
      <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-900">저금통의 모양은 그대로, 안에 담긴 그림만 내 스타일로. AI 변환은 다음 단계에서 선택할 수 있어요.</p>
      <button type="button" onClick={onContinue} disabled={disabled || !selected} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-black text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-40">이 저금통에 그림 담기 →</button>
    </aside>
    {selected && <div className="fixed bottom-4 left-4 right-4 z-20 flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white/95 p-3 shadow-lg backdrop-blur lg:hidden"><span className="pl-1 text-sm font-black text-emerald-900">{selected.name}</span><button type="button" disabled={disabled} onClick={onContinue} className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white">그림 담기 →</button></div>}
  </section>;
}
