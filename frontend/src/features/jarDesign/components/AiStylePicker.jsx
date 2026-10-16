import { AI_STYLE_PREVIEWS } from "../aiStylePreviews.mjs";

/** 같은 대상을 표현한 예시로 AI 그림체를 비교하고 선택하는 카드 모음이다. */
export default function AiStylePicker({ value, onChange, disabled = false, processingStyle = "" }) {
  return <div>
    <p className="mt-5 text-xs leading-5 text-slate-500">같은 꽃을 스타일별로 표현한 예시예요. 실제 결과는 원본에 따라 달라져요. ‘부드러운 3D’는 입체감 있는 그림이며, 실제 3D 모델은 아니에요.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {AI_STYLE_PREVIEWS.map((style) => {
        const processing = processingStyle === style.id;
        return <button key={style.id} type="button" aria-pressed={value === style.id}
          onClick={() => onChange(style.id)} disabled={disabled}
          style={{ background: style.background, borderColor: style.border }}
          className={`group relative flex items-center gap-4 rounded-2xl border p-3 text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-md focus-visible:outline-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-60 ${value === style.id ? "ring-2 ring-violet-500 ring-offset-2" : ""}`}>
          <span aria-hidden="true" className="relative flex h-32 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#fffdf7]">
            <span className="text-4xl" style={{ color: style.color }}>{style.icon}</span>
            <img src={style.image} alt="" width="320" height="320" loading="lazy" decoding="async"
              className="absolute inset-0 h-full w-full object-contain"
              onError={(event) => { event.currentTarget.hidden = true; }} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-slate-800">{processing ? "생성 중..." : style.title}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-600">{style.description}</span>
            <span className="mt-3 block text-xs font-bold" style={{ color: style.color }}>{processing ? "디자인을 만들고 있어요" : value === style.id ? "선택한 스타일 ✓" : "스타일 선택"}</span>
          </span>
        </button>;
      })}
    </div>
  </div>;
}
