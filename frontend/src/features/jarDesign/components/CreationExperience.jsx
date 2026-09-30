import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { getThemeIcon, getThemePalette, getThemePageDecorationIcon } from "../../jarDetail/theme/jarDetailTheme";
import MemoryJarLogoIcon from "../../../components/icons/MemoryJarLogoIcon";

/** 기본 Jar와 커스텀 Jar 생성에 공통으로 쓰는 연출. 실제 요청이 끝나기 전에는 완료를 표시하지 않는다. */
export default function CreationExperience({ theme = "SPRING", name = "", children }) {
  const dialog = useRef(null), [elapsed, setElapsed] = useState(0);
  const reduced = useReducedMotion(), palette = getThemePalette(theme), Decoration = getThemePageDecorationIcon(theme);
  useEffect(() => {
    dialog.current.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    const started = Date.now();
    const interval = window.setInterval(() => setElapsed(Date.now() - started), 1000);
    const warnBeforeLeaving = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => { window.clearInterval(interval); document.body.style.overflow = previous; window.removeEventListener("beforeunload", warnBeforeLeaving); };
  }, []);
  const caption = elapsed < 1800 ? "작은 그림에 소중한 마음을 담아요" : elapsed < 4000 ? "함께할 추억을 위한 자리를 준비해요" : elapsed < 12000 ? "곧 나만의 저금통을 만날 수 있어요" : "저장 응답을 기다리고 있어요. 잠시만 기다려 주세요.";
  return createPortal(<dialog ref={dialog} onCancel={(event) => event.preventDefault()} aria-labelledby="creation-title" aria-describedby="creation-caption" className={`fixed inset-0 m-auto w-[min(92vw,540px)] max-h-[90dvh] overflow-auto rounded-[36px] border border-white/80 p-7 text-center shadow-2xl outline-none backdrop:bg-slate-950/35 backdrop:backdrop-blur-md sm:p-10 ${palette.pageBg}`}>
    <div className="mx-auto flex w-fit items-center gap-2 text-[10px] font-black tracking-[.24em] text-emerald-600"><MemoryJarLogoIcon size={28} /> MEMORY JAR</div>
    <div className="relative mx-auto my-7 w-56 max-w-full">
      {[0, 1, 2, 3].map((i) => <motion.span key={i} aria-hidden="true" className={`pointer-events-none absolute w-8 ${palette.pageSparkle}`} style={{ left: i % 2 ? "92%" : "-8%", top: `${15 + Math.floor(i / 2) * 55}%` }} animate={reduced ? {} : { y: [0, -12, 0], rotate: [0, 20, 0] }} transition={{ duration: 3, repeat: Infinity, delay: i * .4 }}><Decoration /></motion.span>)}
      <motion.div className="relative aspect-square rounded-[32px] bg-white/60 p-5 shadow-[0_18px_60px_#a78bfa25]" animate={reduced ? {} : { y: [0, -7, 0] }} transition={{ duration: 3, repeat: Infinity }}>
        {children || <div className="flex h-full items-center justify-center">{getThemeIcon(theme, 120)}</div>}
      </motion.div>
    </div>
    <h2 id="creation-title" className="text-2xl font-black text-slate-800">저금통을 만들고 있어요</h2>
    {name && <p className="mt-3 break-words text-lg font-bold text-violet-700">{name}</p>}
    <p id="creation-caption" role="status" className="mt-3 text-sm leading-6 text-slate-600">{caption}</p>
    <div aria-hidden="true" className="mt-6 flex justify-center gap-2">{[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-violet-400" animate={reduced ? {} : { opacity: [.3, 1, .3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * .2 }} />)}</div>
    <p className="mt-5 text-xs text-slate-400">저장이 끝나면 새 저금통으로 이동해요.</p>
  </dialog>, document.body);
}
