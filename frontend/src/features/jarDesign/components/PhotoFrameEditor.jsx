import { useEffect, useRef, useState } from "react";
import { JAR_BODIES, getJarBody } from "../jarBodies.mjs";
import { WHOLE_PHOTO, coverPhotoFrame, normalizePhotoFrame, photoFrameControls, samePhotoFrame } from "../photoFraming.mjs";
import { draftImageRendering } from "../imageRendering.mjs";
import { createPreviewImageKey, resolvePreviewImageState } from "../previewImageState.mjs";
import { updateJarDesignComposition, getJarDesignDraftError } from "../../../api/jarDesignDraftApi";
import JarDesignImage from "./JarDesignImage";

/** 선택 사진의 표시 영역만 조절하는 단계다. 드래그는 로컬에서 처리하고 적용할 때 한 번 저장한다. */
export default function PhotoFrameEditor({ draft, previewUrl, disabled, onSaved, onCancel, onBusyChange, onDirtyChange, onRetry, onRefresh }) {
  const [bodyId, setBodyId] = useState(draft.bodyStyle || "CLASSIC");
  const body = getJarBody(bodyId);
  const source = draft.selectedDesignType === "ORIGINAL" ? draft.originalContentFrame || WHOLE_PHOTO : WHOLE_PHOTO;
  const [frame, setFrame] = useState(() => draft.photoFrame || coverPhotoFrame(body.window, source));
  const [loadedKey, setLoadedKey] = useState("");
  const [failedKey, setFailedKey] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const flight = useRef(false), drag = useRef(null);
  const imageKey = createPreviewImageKey(`${draft.selectedDesignType}:${draft.selectedGenerationId}`, previewUrl, retryAttempt);
  const imageState = resolvePreviewImageState({ isCustom:true, imageUrl:previewUrl, imageKey, loadedImageKey:loadedKey, failedImageKey:failedKey });
  const ready = imageState === "ready";
  const dirty = bodyId !== draft.bodyStyle || !samePhotoFrame(frame, draft.photoFrame);
  const controls = photoFrameControls(frame, body.window, source);
  const locked = Boolean(disabled || saving || retrying || !ready || blocked);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);

  function adjust(next) {
    const c = { ...controls, ...next };
    setFrame(coverPhotoFrame(body.window, source, c.zoom, c.x, c.y));
  }
  function changeBody(id) { setBodyId(id); setFrame(coverPhotoFrame(getJarBody(id).window, source)); }
  function startDrag(event) {
    if (locked || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, frame, rect };
  }
  function moveDrag(event) {
    const start = drag.current;
    if (locked || !start || event.pointerId !== start.id) return;
    // 사진을 끌어 움직이면 보이는 원본 영역은 반대 방향으로 이동한다. 모바일/키보드도 같은 경계 제한을 쓴다.
    setFrame(normalizePhotoFrame({ ...start.frame,
      x: start.frame.x - (event.clientX-start.x)/start.rect.width*start.frame.width,
      y: start.frame.y - (event.clientY-start.y)/start.rect.height*start.frame.height }, source));
  }
  function keyboard(event) {
    const offset = { ArrowLeft: [-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] }[event.key];
    if (!offset || locked) return;
    event.preventDefault();
    const step = event.shiftKey ? .001 : .01;
    setFrame(normalizePhotoFrame({ ...frame, x: frame.x-offset[0]*step, y: frame.y-offset[1]*step }, source));
  }
  /** 같은 서명 URL이 반환되어도 기존 이미지 Key 방식으로 다시 로드하고 편집 중인 위치·배율은 유지한다. */
  async function retryPreview() {
    if (!onRetry || disabled || flight.current) return;
    flight.current = true; setRetrying(true);
    try { await onRetry(); setRetryAttempt((attempt) => attempt + 1); }
    catch (failure) { setError(getJarDesignDraftError(failure).message); }
    finally { flight.current = false; setRetrying(false); }
  }
  async function save(imageOnly = false) {
    if (locked || flight.current) return;
    flight.current = true; setSaving(true); onBusyChange?.(true); setError("");
    const composition = { bodyStyle: imageOnly ? null : bodyId, photoFrame: imageOnly ? null : frame };
    try {
      await updateJarDesignComposition(draft.draftId, { ...composition, expectedDesignType: draft.selectedDesignType,
        expectedGenerationId: draft.selectedGenerationId ?? null, expectedBodyStyle: draft.bodyStyle ?? null,
        expectedPhotoFrame: draft.photoFrame ?? null });
      onSaved(composition);
    } catch (failure) {
      const guidance = getJarDesignDraftError(failure);
      setError(guidance.message);
      // 변경된 Draft에는 같은 오래된 스냅샷을 반복 전송하지 않는다. 일시 장애는 편집을 보존한 채 재시도한다.
      setBlocked(["DRAFT_COMPOSITION_TARGET_CHANGED", "DRAFT_NOT_ACTIVE", "DRAFT_NOT_OWNER", "DRAFT_NOT_FOUND",
        "DRAFT_CUSTOM_SELECTION_REQUIRED"].includes(guidance.code));
    }
    finally { flight.current = false; setSaving(false); onBusyChange?.(false); }
  }

  return <section aria-label="사진 배치" className="rounded-[28px] border border-emerald-100 bg-[#fffdf8] p-4 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800">사진 배치 · 원본은 그대로 보관</span><h2 className="mt-4 text-2xl font-black text-stone-800">가장 좋아하는 장면으로, 빈틈없이</h2><p className="mt-2 text-sm leading-6 text-stone-500">저금통마다 보이는 비율이 달라요. 사진을 끌거나 확대해서 담고 싶은 부분을 골라주세요.</p></div>
      {onCancel && <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600">편집 취소</button>}</div>
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
      <div><p className="mb-3 text-xs font-bold text-stone-600">원본과 선택 영역 · 밝은 영역이 저금통에 담겨요</p>
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-stone-100">
          {previewUrl && <img key={imageKey} src={previewUrl} alt="사진 배치 원본" className="h-full w-full object-contain" draggable={false} style={{ imageRendering: draftImageRendering(draft) }} onLoad={() => setLoadedKey(imageKey)} onError={() => setFailedKey(imageKey)}/>}
          <div aria-hidden="true" className="pointer-events-none absolute border-2 border-emerald-400" style={{ left:`${frame.x*100}%`,top:`${frame.y*100}%`,width:`${frame.width*100}%`,height:`${frame.height*100}%`,boxShadow:"0 0 0 800px rgb(30 45 35 / .42)" }}><span className="absolute inset-x-1/3 inset-y-0 border-x border-white/40"/><span className="absolute inset-x-0 inset-y-1/3 border-y border-white/40"/></div>
        </div>
        <p className="mt-2 text-xs leading-5 text-stone-500">영역 밖의 사진은 지워지지 않아요. 언제든 다른 부분으로 배치할 수 있어요.</p>
      </div>
      <div className="min-w-0 rounded-3xl border border-stone-200 bg-gradient-to-b from-[#e7eee5] to-[#f6ead8] p-4">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-black tracking-wide text-emerald-900">적용하면 이렇게 보여요</p><span className="text-xs text-stone-600">{body.name}</span></div>
        <div className="relative mx-auto mt-3 max-w-[420px]">
          <JarDesignImage key={imageKey} bodyStyle={bodyId} imageUrl={previewUrl} photoFrame={frame} alt="사진 배치 적용 미리보기" imageRendering={draftImageRendering(draft)} onImageError={() => setFailedKey(imageKey)} showDefaultSlot/>
          <div role="application" aria-label="저금통 사진 위치 조절" aria-describedby="photo-drag-help" tabIndex={locked ? -1 : 0}
            className={`absolute rounded-xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-emerald-700 ${locked ? "" : "cursor-grab touch-none active:cursor-grabbing"}`}
            style={{ left:`${body.window.x/4.8}%`,top:`${body.window.y/4.8}%`,width:`${body.window.width/4.8}%`,height:`${body.window.height/4.8}%` }}
            onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current=null; }} onPointerCancel={() => { drag.current=null; }} onLostPointerCapture={() => { drag.current=null; }} onKeyDown={keyboard}/>
        </div>
        <p id="photo-drag-help" className="text-center text-xs text-emerald-900">사진을 드래그 · 방향키로 이동 · Shift로 미세 조절</p>
      </div>
    </div>
    {!ready && <div role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{imageState === "failed" ? "사진을 불러오지 못했어요." : "사진을 준비하고 있어요."}{onRetry && <button type="button" disabled={saving || retrying || disabled} onClick={() => void retryPreview()} className="ml-3 min-h-11 font-bold underline">이미지 다시 불러오기</button>}</div>}
    <div className="mt-6 grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-2">
      <label className="text-sm font-bold text-stone-700">저금통 모양<select aria-label="사진 배치 저금통 모양" value={bodyId} disabled={locked} onChange={(e) => changeBody(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3">{JAR_BODIES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="text-sm font-bold text-stone-700">사진 확대 <span className="float-right text-emerald-800">{controls.zoom.toFixed(2)}배</span><input aria-label="사진 확대" type="range" min="1" max="4" step=".01" value={controls.zoom} disabled={locked} onChange={(e) => adjust({ zoom:Number(e.target.value) })} className="mt-3 h-8 w-full accent-emerald-700"/></label>
      <label className="text-sm font-bold text-stone-700">가로 위치<input aria-label="사진 가로 위치" type="range" min="0" max="1" step=".005" value={controls.x} disabled={locked} onChange={(e) => adjust({ x:Number(e.target.value) })} className="mt-2 h-8 w-full accent-emerald-700"/></label>
      <label className="text-sm font-bold text-stone-700">세로 위치<input aria-label="사진 세로 위치" type="range" min="0" max="1" step=".005" value={controls.y} disabled={locked} onChange={(e) => adjust({ y:Number(e.target.value) })} className="mt-2 h-8 w-full accent-emerald-700"/></label>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={locked} onClick={() => setFrame(coverPhotoFrame(body.window, source))} className="min-h-11 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600">빈틈없이 채우기 · 초기화</button><p className="text-xs text-stone-500">사진 창 비율 {body.window.width} : {body.window.height} · 사진이 찌그러지지 않아요</p></div>
    {error && <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"><p>{error}</p>
      {blocked && onRefresh && <button type="button" disabled={saving || disabled} onClick={onRefresh} className="mt-2 min-h-11 font-bold underline">최신 상태 다시 불러오기</button>}</div>}
    <div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" disabled={locked} onClick={() => void save(true)} className="min-h-12 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-stone-700">저금통 없이 이미지만 사용하기</button><button type="button" disabled={locked} onClick={() => void save()} className="min-h-12 rounded-xl bg-emerald-800 px-4 text-sm font-black text-white disabled:opacity-50">{saving ? "배치를 저장하고 있어요…" : "이 모습으로 적용하고 계속하기 →"}</button></div>
    <p className="mt-3 text-xs leading-5 text-stone-500">이미지만 사용하면 기존 배경 지우기·이미지 자르기를 이용할 수 있어요. 사진 배치를 바꾸면 투입구 위치는 다시 확인해 주세요.</p>
  </section>;
}
