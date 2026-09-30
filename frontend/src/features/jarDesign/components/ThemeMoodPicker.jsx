import { getThemeIcon, getThemePalette, getThemePageDecorationIcon } from "../../jarDetail/theme/jarDetailTheme";

export const THEME_MOODS = [
  ["SPRING", "봄", "벚꽃처럼 다정한 순간"], ["SUMMER", "여름", "햇살 아래 싱그러운 기억"],
  ["AUTUMN", "가을", "노을빛으로 물든 이야기"], ["WINTER", "겨울", "눈처럼 포근한 추억"],
  ["LAVENDER", "라벤더", "은은하게 남는 마음"], ["DEW", "이슬", "맑고 투명한 우리"],
  ["SAND", "모래", "차곡차곡 쌓이는 날들"], ["MOONLIGHT", "달빛", "밤하늘에 간직한 약속"],
];

/** 기존 Jar 테마 SVG와 팔레트를 재사용해 선택과 완성 화면이 같은 분위기를 갖게 한다. */
export default function ThemeMoodPicker({ value, onChange, disabled }) {
  return <fieldset disabled={disabled} className="sm:col-span-2"><legend className="text-sm font-bold text-slate-700">우리의 추억은 어떤 분위기인가요?</legend>
    <div className="mt-3 grid grid-cols-4 gap-2">{THEME_MOODS.map(([theme, label]) => <button type="button" key={theme} aria-label={label} aria-pressed={value === theme} onClick={() => onChange(theme)} className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border text-xs font-bold transition ${getThemePalette(theme).pageBg} ${value === theme ? "border-violet-400 text-violet-800 ring-2 ring-violet-300" : "border-white text-slate-600 hover:border-violet-200"}`}>
      {getThemeIcon(theme, 36)}{label}{value === theme ? " ✓" : ""}
    </button>)}</div>
  </fieldset>;
}

/** 분위기는 이미지 바깥 배경에만 적용해 AI 원본의 색을 바꾸지 않는다. */
export function ThemePreviewStage({ theme, name, children }) {
  const palette = getThemePalette(theme), Decoration = getThemePageDecorationIcon(theme);
  const mood = THEME_MOODS.find(([id]) => id === theme) || THEME_MOODS[0];
  return <div className={`relative overflow-hidden rounded-[28px] border border-white p-5 shadow-sm sm:p-7 ${palette.pageBg}`}>
    <div aria-hidden="true" className={`pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full blur-3xl ${palette.pageGlowPrimary}`} />
    <div className="relative flex items-center justify-between"><span className={`rounded-full px-3 py-1.5 text-xs font-black ${palette.countChip}`}>{mood[1]}의 기억</span><span className="text-[10px] font-bold tracking-[.2em] text-slate-400">PREVIEW</span></div>
    <div className="relative mt-6">
      <Decoration className={`pointer-events-none absolute -left-3 top-0 z-10 h-10 w-10 ${palette.pageSparkle}`} />
      {children}
      <Decoration className={`pointer-events-none absolute -right-2 bottom-0 h-8 w-8 ${palette.pageSparkle}`} />
    </div>
    <h4 className="relative mt-6 break-words text-center text-xl font-black text-slate-800">{name || "아직 이름 없는 우리의 추억"}</h4>
    <p className="relative mt-2 text-center text-sm text-slate-500">{mood[2]}</p>
  </div>;
}
