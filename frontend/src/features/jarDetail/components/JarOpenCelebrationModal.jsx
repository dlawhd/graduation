import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getThemeIcon } from "../theme/jarDetailTheme";
import { canShowJarOpening, initialOpening, openingReducer, OPENING_HIT_MS, OPENING_IMPACT_MS } from "../utils/jarOpening.mjs";
import { buildJarFracture, crackCutoutUrl } from "../utils/jarFracture.mjs";
import { loadOpeningSilhouette, vectorOpeningSilhouette } from "../utils/jarOpeningSilhouette.mjs";
import apiClient from "../../../api/apiClient";
import { getJarBody } from "../../jarDesign/jarBodies.mjs";
import { createJarOpeningAudio } from "../utils/jarOpeningAudio.mjs";
import JarCustomDesignVisual from "./JarCustomDesignVisual";
import "../jarOpening.css";

/**
 * 서버에서 이미 열린 저금통을 세 번 두드려 추억을 꺼내는 축하 화면이다.
 * 데이터를 바꾸지 않고 현재 저금통 그림에 금·빛·쪽지가 펼쳐지는 효과만 적용한다.
 * body 바로 아래의 native dialog로 띄워 부모 크기·z-index 영향을 피하고 키보드 초점을 안에 유지한다.
 */
export default function JarOpenCelebrationModal(props) {
  if (!canShowJarOpening(props.open, props.jar, props.event)) return null;
  return createPortal(<OpeningExperience key={`${props.jar.jarId}:${props.event?.openedAt || props.jar.openAt || ""}`} {...props}/>, document.body);
}

/** 정적인 2D 그림만 재사용한다. 두드릴 때 3D 모델이나 외부 이미지 생성 요청을 실행하지 않는다. */
const OpeningArtwork = memo(function OpeningArtwork({ jar, palette, onLoad, onError }) {
  if (jar.design) return <JarCustomDesignVisual design={jar.design} alt="" className="jar-opening-saved-art"
    onImageLoad={onLoad} onImageError={onError}/>;
  return <div className="jar-opening-theme-art">
    <div className={`jar-opening-theme-lid ${palette?.lid || "bg-emerald-200"}`}/>
    <div className={`jar-opening-theme-body ${palette?.jarBody || "bg-emerald-50 border-emerald-200"}`}>
      <span className="jar-opening-theme-shine"/>{getThemeIcon(jar.theme, 86)}
    </div>
  </div>;
});

/** 작은 나무 망치와 리본을 SVG로 그려, 실제 버튼 입력과 같은 타이밍으로 움직인다. */
function WoodenMallet() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return <svg viewBox="0 0 160 180" fill="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="15" y1="10" x2="90" y2="85" gradientUnits="userSpaceOnUse"><stop stopColor="#f6dfb5"/><stop offset=".5" stopColor="#d6a767"/><stop offset="1" stopColor="#b88246"/></linearGradient></defs>
    <g>
      <rect x="68" y="52" width="22" height="121" rx="11" fill={`url(#${id})`} stroke="#aa783f"/>
      <path d="M74 83v69m8-80v82" stroke="#f5dbb1" strokeWidth="2" opacity=".65"/>
      <rect x="23" y="20" width="113" height="61" rx="23" fill={`url(#${id})`} stroke="#b58b54" strokeWidth="2"/>
      <ellipse cx="42" cy="50" rx="19" ry="29" fill="#e8c794" stroke="#b58b54"/>
      <path d="M67 31h47M65 39h58M68 66h43" stroke="#ad7b45" opacity=".35"/>
      <path d="M78 89C42 57 31 88 74 99C51 119 59 133 80 103C104 127 119 114 87 95C126 92 120 66 84 89Z" fill="#9baa78" stroke="#788b59"/>
      <circle cx="80" cy="96" r="7" fill="#738758"/>
    </g>
  </svg>;
}

function LeafSprig({ className = "" }) {
  return <svg className={className} viewBox="0 0 130 90" fill="none" aria-hidden="true"><path d="M7 78Q49 29 122 10" stroke="#a0ad82" strokeWidth="2"/>
    <path d="M23 61Q3 37 33 40Q38 53 23 61ZM44 42Q25 13 55 22Q62 33 44 42ZM71 28Q66 2 88 9Q92 21 71 28ZM42 45Q70 40 64 63Q48 67 42 45ZM77 25Q108 21 101 42Q85 47 77 25ZM104 16Q117-3 129 6Q128 19 104 16Z" fill="#a5b587" opacity=".65"/>
  </svg>;
}

/** 한 번의 연출에 사용하는 단계·소리·타이머를 관리하고 닫은 뒤에는 모두 정리한다. */
function OpeningExperience({ jar, palette, event, onClose, onViewNotes, onReloadDesignImage = null }) {
  const [state, dispatch] = useReducer(openingReducer, initialOpening);
  const [sound, setSound] = useState(true);
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false);
  const reduced = systemReduced;
  const [artAttempt, setArtAttempt] = useState(0), [reloading, setReloading] = useState(false);
  const artVersion = JSON.stringify([jar.design?.imageUrl, jar.design?.bodyArtworkUrl, artAttempt]);
  const initialArtStatus = jar.design ? jar.design.imageUrl ? "loading" : "error" : "ready";
  const [art, setArt] = useState({ version: artVersion, status: initialArtStatus });
  const artStatus = art.version === artVersion ? art.status : initialArtStatus;
  const currentArt = useRef(artVersion), loadedPieces = useRef({ version: artVersion, ids: new Set() });
  const [matte, setMatte] = useState(null);
  currentArt.current = artVersion;
  if (loadedPieces.current.version !== artVersion) loadedPieces.current = { version: artVersion, ids: new Set() };
  const dialog = useRef(null), actionButton = useRef(null), tapLocked = useRef(false), finished = useRef(false);
  const audio = useRef(null), reloadLocked = useRef(false), alive = useRef(false);
  const soundRef = useRef(sound); soundRef.current = sound;
  const clipPrefix = `jar-opening-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const body = useMemo(() => getJarBody(jar.design?.bodyStyle, jar.design?.customBody),
    [jar.design?.bodyStyle, jar.design?.customBody]);
  const vectorShape = useMemo(() => body ? vectorOpeningSilhouette(body.path) : !jar.design
    ? vectorOpeningSilhouette("M58 92A182 34 0 1 1 422 92A182 34 0 1 1 58 92ZM77 174Q77 96 240 96Q403 96 403 174V345Q403 432 326 432H154Q77 432 77 345Z") : null, [body, Boolean(jar.design)]);
  const shape = vectorShape || (matte?.version === artVersion ? matte.shape : null);
  const fracture = useMemo(() => buildJarFracture({ contains: shape?.contains }), [shape]);
  const pieces = fracture.pieces;
  const cutout = useMemo(() => crackCutoutUrl(fracture.cracks, state.damage), [fracture, state.damage]);
  const complete = state.phase === "complete", tapping = state.phase === "tapping";
  // 모든 조각과 실제 윤곽이 준비된 뒤 두드리기를 허용한다. 이전 URL의 이벤트는 무시한다.
  const loaded = useCallback(id => {
    if (currentArt.current !== artVersion) return;
    loadedPieces.current.ids.add(id);
    if (loadedPieces.current.ids.size === 13) setArt(current => current.version === artVersion && current.status === "error"
      ? current : { version: artVersion, status: "ready" });
  }, [artVersion]);
  const failed = useCallback(() => {
    if (currentArt.current === artVersion) setArt({ version: artVersion, status: "error" });
  }, [artVersion]);
  const artCallbacks = useMemo(() => Object.fromEntries(pieces.map(piece => [piece.id, () => loaded(piece.id)])), [pieces, loaded]);

  useEffect(() => {
    if (vectorShape) { loaded("silhouette"); return undefined; }
    if (!jar.design?.imageUrl) { failed(); return undefined; }
    const controller = new AbortController(); let resource;
    loadOpeningSilhouette(jar.design?.imageUrl, jar.design?.imageTextureUrl, {
      signal: controller.signal,
      fetchBlob: async (path, signal) => (await apiClient.get(path, { signal, responseType: "blob", timeout: 8000 })).data,
    }).then(result => {
      resource = result;
      if (controller.signal.aborted || currentArt.current !== artVersion) { result.dispose(); return; }
      setMatte({ version: artVersion, shape: result }); loaded("silhouette");
    }).catch(() => { if (!controller.signal.aborted) failed(); });
    return () => { controller.abort(); resource?.dispose(); };
  }, [vectorShape, artVersion, jar.design?.imageTextureUrl, loaded, failed]);

  useLayoutEffect(() => {
    alive.current = true; finished.current = false;
    currentArt.current = artVersion;
    const node = dialog.current, previous = document.activeElement, overflow = document.body.style.overflow;
    node.showModal(); document.body.style.overflow = "hidden"; actionButton.current?.focus();
    return () => {
      alive.current = false; currentArt.current = null; node.close(); audio.current?.close(); audio.current = null;
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return undefined;
    const changed = () => setSystemReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);

  useEffect(() => {
    if (!tapping) { tapLocked.current = false; return undefined; }
    const impactTimer = window.setTimeout(() => {
      if (soundRef.current) audio.current?.play(state.hits);
      dispatch({ type: "IMPACT", hit: state.hits });
    }, reduced ? 0 : OPENING_IMPACT_MS);
    const timer = window.setTimeout(() => dispatch({ type: "SETTLE", hit: state.hits }), reduced ? 60 : OPENING_HIT_MS);
    return () => { window.clearTimeout(impactTimer); window.clearTimeout(timer); };
  }, [tapping, state.hits, reduced]);

  useEffect(() => {
    if (artStatus !== "loading") return undefined;
    const timer = window.setTimeout(failed, 8000);
    return () => window.clearTimeout(timer);
  }, [artStatus, failed]);

  /** 클릭 순간에만 음원을 준비한다. 중복 클릭을 즉시 차단해 효과음과 단계가 겹치지 않게 한다. */
  function hit() {
    if (finished.current || tapLocked.current || complete || artStatus !== "ready") return;
    tapLocked.current = true;
    if (sound) { audio.current ||= createJarOpeningAudio(); audio.current.prepare(); }
    dispatch({ type: "HIT" });
  }
  function skip() { if (finished.current) return; tapLocked.current = true; audio.current?.stop(); dispatch({ type: "SKIP" }); }
  function finish(viewNotes) {
    if (finished.current) return;
    finished.current = true; audio.current?.stop();
    if (viewNotes) onViewNotes?.(); else onClose?.();
  }
  /** 만료된 이미지 주소는 기존 상세 재조회로만 갱신한다. 창을 닫은 뒤 응답은 반영하지 않는다. */
  async function reloadArt() {
    if (reloadLocked.current || !onReloadDesignImage) return;
    reloadLocked.current = true; setReloading(true);
    try {
      const success = await onReloadDesignImage();
      if (!alive.current) return;
      if (success) setArtAttempt(value => value + 1); else failed();
    } catch { if (alive.current) failed(); }
    finally { reloadLocked.current = false; if (alive.current) setReloading(false); }
  }

  /** 단계 변경으로 버튼이 사라지거나 비활성화돼도 Tab 초점은 연출 창 안에 유지한다. */
  function keepFocus(event) {
    event.stopPropagation();
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current.querySelectorAll("button:not(:disabled)"))
      .filter(node => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!controls.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  const stageTitle = complete ? "03. 추억이 열렸어요" : state.hits >= 2 ? "02. 한 번 더 톡" : state.hits ? "01. 첫 번째 톡" : "추억을 열어볼까요?";
  return <dialog ref={dialog} className="jar-opening-dialog" aria-labelledby={`${clipPrefix}-title`} data-phase={state.phase} data-reduced={String(reduced)}
    onKeyDown={keepFocus} onCancel={event => { event.preventDefault(); finish(false); }}>
    <div className="jar-opening-paper">
      <LeafSprig className="jar-opening-leaves is-left"/><LeafSprig className="jar-opening-leaves is-right"/>
      <div className="jar-opening-tools">
        <button type="button" aria-label={sound ? "소리 끄기" : "소리 켜기"} aria-pressed={!sound}
          onClick={() => { if (sound) audio.current?.stop(); setSound(value => !value); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z"/>{sound ? <path d="M16 8q5 4 0 8m3-11q8 7 0 14"/> : <path d="m17 9 5 6m0-6-5 6"/>}</svg>
          <span>{sound ? "소리 끄기" : "소리 켜기"}</span>
        </button>
        {!complete && <button type="button" onClick={skip}>건너뛰기 <span aria-hidden="true">↗</span></button>}
      </div>
      <header className="jar-opening-heading">
        <p className="jar-opening-eyebrow">MEMORY JAR</p>
        <h2 id={`${clipPrefix}-title`}>톡톡, 추억이 열리는 순간</h2>
        <svg className="jar-opening-ribbon" viewBox="0 0 240 22" fill="none" aria-hidden="true"><path d="M3 15q65 4 102-4m27 0q44 8 105 3M120 11C94-13 88 20 119 12C149-12 153 20 121 12l-5 9m5-9 5 9" stroke="#bf9b50" strokeWidth="1.3"/></svg>
        <p className="jar-opening-stage-title" aria-live="polite" aria-atomic="true">{stageTitle}</p>
      </header>
      <div className="jar-opening-progress" aria-label={`${state.hits} / 3번 두드림`}>
        {[1, 2, 3].map(step => <span key={step} data-filled={state.hits >= step} aria-hidden="true"/>)}
      </div>
      <div className="jar-opening-scene" data-hits={state.damage}>
        <div className="jar-opening-halo" aria-hidden="true"/>
        <svg className="jar-opening-definitions" width="0" height="0" aria-hidden="true"><defs>{pieces.map(piece =>
          <clipPath key={piece.id} id={`${clipPrefix}-${piece.id}`} clipPathUnits="objectBoundingBox"><path d={piece.path}/></clipPath>)}</defs></svg>
        <div className="jar-opening-figure" role="img" aria-label={`${jar.name || "저금통"}의 저장된 디자인`} data-art-status={artStatus}
          data-impact-x={fracture.impact.x} data-impact-y={fracture.impact.y}>
          <div className="jar-opening-surface">
          {pieces.map(piece => <div key={piece.id} className={`jar-opening-piece is-${piece.id}`} aria-hidden="true"
            style={{ "--piece-x": `${piece.x}px`, "--piece-y": `${piece.y}px`, "--piece-rotate": `${piece.rotate}deg`, "--piece-delay": `${piece.delay}s` }}>
            <div className="jar-opening-piece-clip" style={{ clipPath: `url(#${clipPrefix}-${piece.id})`,
              maskImage: [!vectorShape && shape ? `url("${shape.url}")` : null, cutout ? `url("${cutout}")` : null].filter(Boolean).join(",") || undefined,
              maskSize: "100% 100%", maskRepeat: "no-repeat", maskComposite: "intersect" }}>
              <OpeningArtwork key={artAttempt} jar={jar} palette={palette} onLoad={artCallbacks[piece.id]} onError={failed}/>
            </div>
          </div>)}
          {shape && <svg viewBox="0 0 480 480" className="jar-opening-cracks" aria-hidden="true" data-visible={state.damage > 0 && !complete}>
            <defs><mask id={`${clipPrefix}-surface`} maskUnits="userSpaceOnUse" x="0" y="0" width="480" height="480" style={{ maskType: "alpha" }}>
              <image href={shape.url} x="0" y="0" width="480" height="480"/>
            </mask></defs>
            <g mask={`url(#${clipPrefix}-surface)`}>{fracture.cracks.filter(edge => edge.stage <= state.damage).map(edge =>
              <g key={edge.id} className="jar-opening-crack-line" data-edge={edge.id} style={{ "--crack-length": edge.length }}>
                <path d={edge.path} className="jar-opening-crack-depth" strokeWidth={state.damage === 1 ? 3.3 : 4.6}/>
                <path d={edge.path} className="jar-opening-crack-rim" transform="translate(-.65 -.65)"/>
              </g>)}</g>
          </svg>}
          </div>
          {!complete && artStatus === "ready" && <div className="jar-opening-mallet" aria-hidden="true"
            style={{ left: `${fracture.impact.x / 4.8}%`, top: `${fracture.impact.y / 4.8}%` }}>
            <div className="jar-opening-mallet-swing"><WoodenMallet/></div>
          </div>}
        </div>
        {complete && <div className="jar-opening-letters" aria-hidden="true">{[-1, 0, 1].map((direction, index) =>
          <span key={direction} className="jar-opening-envelope" style={{ "--letter-x": `${direction * 105}px`, "--letter-y": `${-95 - (index % 2) * 55}px`, "--letter-rotate": `${direction * 16}deg`, "--letter-delay": `${index * .12}s` }}>♡</span>)}</div>}
        {complete && <div className="jar-opening-sparks" aria-hidden="true">{Array.from({ length: 12 }, (_, index) =>
          <i key={index} style={{ "--spark-x": `${Math.cos(index * Math.PI / 6) * 135}px`, "--spark-y": `${Math.sin(index * Math.PI / 6) * 135}px`, "--letter-delay": `${index * .04}s` }}/>)}</div>}
        {artStatus === "loading" && <p className="jar-opening-art-message" role="status">우리 저금통을 불러오고 있어요…</p>}
        {artStatus === "error" && <div className="jar-opening-art-message" role="alert"><p>저금통 그림을 불러오지 못했어요.<br/>연출을 건너뛰어 추억을 볼 수 있어요.</p>
          {onReloadDesignImage && <button type="button" onClick={reloadArt} disabled={reloading}>{reloading ? "불러오는 중…" : "이미지 다시 불러오기"}</button>}</div>}
      </div>
      <div className="jar-opening-copy" role="status" aria-live="polite">
        {complete ? "함께 모은 추억이 열렸어요." : state.hits === 2 ? "빛이 새어 나와요. 이제 한 번만 더!" : state.hits === 1 ? "작은 금 사이로 추억이 깨어나고 있어요." : "작은 망치로 세 번, 소중한 기억을 꺼내볼까요?"}
      </div>
      <div className="jar-opening-actions">
        <button ref={actionButton} type="button" className="jar-opening-primary" onClick={complete ? () => finish(true) : hit}
          disabled={!complete && (tapping || artStatus !== "ready")}>
          {complete ? "추억 보러가기" : tapping ? "톡!" : state.hits === 2 ? "마지막으로 톡!" : "톡! 두드리기"}<span aria-hidden="true">{complete ? " ↗" : " ✧"}</span>
        </button>
        <button type="button" className="jar-opening-later" onClick={() => finish(false)}>조금 있다 보기</button>
      </div>
    </div>
  </dialog>;
}
