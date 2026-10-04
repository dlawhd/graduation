import { useEffect, useRef, useState } from "react";
import { draftImageRendering } from "../imageRendering.mjs";
import { getJarDesignDraftError, getJarDesignOriginalPreview, getJarDesignGenerationPreview,
  updateJarDesignSlot } from "../../../api/jarDesignDraftApi";
import { DEFAULT_SLOT, slotStyle, normalizeSlot, sameSlot, slotAtPointer, storedSlot } from "../slotGeometry.mjs";
import { SLOT_CATALOG, SLOT_COLLECTIONS, filterSlotStyles, getSlotAppearance } from "../slotCatalog.mjs";
import JarSlotOverlay, { SlotSwatch } from "./JarSlotOverlay";
import { toCutoutMaskStyle } from "../cutoutGeometry.mjs";
import JarDesignImage from "./JarDesignImage";
import { getJarBody } from "../jarBodies.mjs";

/** 선택한 원본/AI 이미지 위에 투입구를 배치하고 Draft에 위치·크기·모양을 저장하는 편집기다. */
export default function SlotEditor({ draft, previewUrl, cutoutRegions, disabled, onSaved, onBusyChange, onDirtyChange }) {
  const [savedSlot, setSavedSlot] = useState(() => storedSlot(draft));
  const body = getJarBody(draft.bodyStyle);
  const [slot, setSlot] = useState(() => normalizeSlot(storedSlot(draft) || body?.slot || DEFAULT_SLOT));
  const [collection, setCollection] = useState(() => {
    const storedCollection = storedSlot(draft) && getSlotAppearance(draft.slotStyle).collection;
    return SLOT_COLLECTIONS.includes(storedCollection) ? storedCollection : "꽃과 자연";
  });
  const selectedAppearance = getSlotAppearance(slot.slotStyle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [retryUrl, setRetryUrl] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");
  const requestInFlight = useRef(false);
  const pointerId = useRef(null);
  const url = retryUrl || previewUrl || "";
  const imageReady = Boolean(url && loadedUrl === url && failedUrl !== url);
  const dirty = !sameSlot(slot, savedSlot);
  const cutoutMaskStyle = toCutoutMaskStyle(cutoutRegions);
  const locked = disabled || saving || blocked || !imageReady;

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  /** 마우스·터치 모두 같은 좌표 변환을 사용하며, 드래그 중에는 서버에 요청하지 않는다. */
  function movePointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setSlot((current) => slotAtPointer(current, event.clientX, event.clientY, bounds));
  }

  function moveWithKeyboard(event) {
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (locked || !offsets[event.key]) return;
    event.preventDefault();
    const [x, y] = offsets[event.key];
    const step = event.shiftKey ? 0.001 : 0.01;
    setSlot((current) => normalizeSlot({ ...current, centerX: current.centerX + x * step, centerY: current.centerY + y * step }));
  }

  /** 만료·로드 실패 때만 URL을 다시 발급하며, 사용자가 편집한 좌표는 유지한다. */
  async function retryPreview() {
    if (retrying) return;
    setRetrying(true);
    setError("");
    try {
      const preview = draft.selectedDesignType === "ORIGINAL"
        ? await getJarDesignOriginalPreview(draft.draftId)
        : await getJarDesignGenerationPreview(draft.draftId, draft.selectedGenerationId);
      setLoadedUrl("");
      setFailedUrl("");
      setRetryUrl(preview.previewUrl);
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setRetrying(false);
    }
  }

  /** 현재 선택 Snapshot을 함께 전송해 다른 후보로 바뀐 Draft에 잘못 저장하는 것을 막는다. */
  async function saveSlot() {
    if (locked || !dirty || requestInFlight.current) return;
    requestInFlight.current = true;
    setSaving(true);
    onBusyChange(true);
    setError("");
    const snapshot = normalizeSlot(slot);
    try {
      await updateJarDesignSlot(draft.draftId, { ...snapshot,
        expectedDesignType: draft.selectedDesignType, expectedGenerationId: draft.selectedGenerationId });
      setSavedSlot(snapshot);
      onSaved(snapshot);
    } catch (requestError) {
      const failure = getJarDesignDraftError(requestError);
      if (["DRAFT_SLOT_TARGET_CHANGED", "DRAFT_NOT_ACTIVE", "DRAFT_NOT_OWNER", "DRAFT_NOT_FOUND",
        "DRAFT_CUSTOM_SELECTION_REQUIRED"].includes(failure.code)) {
        setBlocked(true);
      }
      setError(failure.code === "DRAFT_SLOT_TARGET_CHANGED"
        ? "다른 화면에서 디자인이 바뀌었어요. 보관함을 새로고침한 뒤 다시 편집해 주세요."
        : failure.message);
    } finally {
      requestInFlight.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <section className="mt-8 border-t border-violet-100 pt-8" aria-label="동전 투입구 편집">
      <span className="text-xs font-black tracking-widest text-violet-500">{body ? "04" : "02"} · 작은 디테일</span>
      <h3 className="mt-2 text-xl font-black text-slate-800">추억이 들어갈 작은 입구</h3>
      <p id="slot-editor-help" className="mt-2 text-sm leading-6 text-slate-500">그림을 누르거나 드래그해 위치를 정해 주세요. 방향키로도 움직일 수 있어요.</p>
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div role="group" aria-label="투입구 위치 편집 영역" aria-describedby="slot-editor-help" tabIndex={locked ? -1 : 0}
            className="relative aspect-square w-full touch-none overflow-hidden rounded-xl bg-slate-100 outline-offset-4 focus-visible:outline-violet-500"
            onKeyDown={moveWithKeyboard}
            onPointerDown={(event) => {
              if (locked || event.button !== 0 || pointerId.current !== null) return;
              pointerId.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              movePointer(event);
            }}
            onPointerMove={(event) => { if (!locked && pointerId.current === event.pointerId) movePointer(event); }}
            onPointerUp={(event) => { if (pointerId.current === event.pointerId) pointerId.current = null; }}
            onPointerCancel={() => { pointerId.current = null; }}
            onLostPointerCapture={() => { pointerId.current = null; }}>
            {url && <JarDesignImage key={`${url}-${retrying}`} bodyStyle={draft.bodyStyle} photoFrame={draft.photoFrame} imageUrl={url} alt="투입구를 배치할 선택 디자인"
              className="h-full w-full select-none object-contain"
              imageStyle={cutoutMaskStyle} imageRendering={draftImageRendering(draft)}
              onImageLoad={(event) => {
                // 잘못된 이미지 비율 위에서 좌표를 저장하지 않는다. 서버 결과는 모두 정사각형이다.
                if (event.currentTarget.naturalWidth === event.currentTarget.naturalHeight) setLoadedUrl(url);
                else setFailedUrl(url);
              }} onImageError={() => setFailedUrl(url)} />}
            {imageReady && <JarSlotOverlay slot={slot} />}
            {!imageReady && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 p-6 text-center text-sm text-slate-500">
              {failedUrl === url && url ? "이미지를 불러오지 못했어요. 아래에서 다시 불러와 주세요." : "이미지를 불러오는 중이에요."}
            </div>}
          </div>
          <button type="button" onClick={() => void retryPreview()} disabled={saving || retrying || disabled}
            className="mt-3 min-h-11 text-sm font-bold text-violet-700 disabled:opacity-50">{retrying ? "불러오는 중..." : "이미지 다시 불러오기"}</button>
        </div>
        <div className="min-w-0 space-y-5">
          <fieldset disabled={locked} className="space-y-5 disabled:opacity-50">
            <legend className="sr-only">투입구 모양과 위치</legend>
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-slate-700">어떤 입구가 어울릴까요?</p><span className="text-xs text-slate-500">{SLOT_CATALOG.length}가지 작은 디테일</span></div>
              <div className="mb-3 flex min-h-20 items-center gap-4 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-rose-50 p-4">
                <SlotSwatch value={selectedAppearance.id}/>
                <div className="min-w-0"><p className="text-sm font-black text-slate-800">{selectedAppearance.name}</p><p className="mt-1 text-xs leading-5 text-slate-500">{selectedAppearance.description}</p></div>
              </div>
              <div role="group" aria-label="투입구 컬렉션" className="mb-3 flex flex-wrap gap-1.5">
                {SLOT_COLLECTIONS.map(label => <button type="button" key={label} aria-pressed={collection === label} onClick={() => setCollection(label)}
                  className={`min-h-11 rounded-full px-3 text-xs font-bold ${collection === label ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filterSlotStyles(collection).map(({id: value, name: label, description}) => <button key={value} type="button" aria-label={label} aria-pressed={slotStyle(slot.slotStyle) === value}
                  onClick={() => setSlot((current) => normalizeSlot({ ...current, slotStyle: value }))}
                  className={`flex min-h-28 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-xs font-bold ${slotStyle(slot.slotStyle) === value ? "border-violet-500 bg-violet-50 text-violet-800 ring-1 ring-violet-300" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  <SlotSwatch value={value} size={56}/><span>{label}{slotStyle(slot.slotStyle) === value && <span aria-hidden="true"> ✓</span>}</span>
                  <span className="text-[10px] font-normal leading-4 text-slate-500">{description}</span>
                </button>)}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">종류를 둘러봐도 선택은 유지돼요. 모양을 바꿀 때 화면 밖으로 나가는 경우만 위치를 안쪽으로 맞춰요.</p>
            </div>
            <label className="block text-sm font-bold text-slate-700">투입구 크기
              <input type="range" min="0" max="100" step="1" value={slot.sizeRatio * 100}
                onChange={(event) => setSlot((current) => normalizeSlot({ ...current, sizeRatio: Number(event.target.value) / 100 }))}
                className="mt-2 block min-h-11 w-full accent-violet-600" />
              <span className="flex justify-between text-xs font-normal text-slate-500"><span>작게</span><span>크게</span></span>
            </label>
            {[['centerX', '가로 위치'], ['centerY', '세로 위치']].map(([field, label]) => (
              <label key={field} className="block text-sm font-bold text-slate-700">{label}
                <input type="range" min="0" max="100" step="0.1" value={slot[field] * 100}
                  onChange={(event) => setSlot((current) => normalizeSlot({ ...current, [field]: Number(event.target.value) / 100 }))}
                  className="mt-2 block min-h-11 w-full accent-violet-600" />
              </label>
            ))}
            <button type="button" onClick={() => setSlot((current) => body ? normalizeSlot({ ...body.slot, slotStyle: current.slotStyle }) : { ...current, centerX: .5, centerY: .5 })}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold">{body ? "저금통 추천 위치로" : "가운데로 초기화"}</button>
          </fieldset>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <p role="status" className="text-sm text-slate-600">{saving ? "투입구 저장 중..." : dirty ? "모양·위치·크기를 정한 뒤 저장해 주세요." : "투입구 모양과 위치가 저장됐어요."}</p>
          <button type="button" onClick={() => void saveSlot()} disabled={locked || !dirty}
            className="min-h-12 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "저장 중..." : "투입구 저장"}</button>
          <p className="text-xs leading-5 text-slate-500">투입구는 그림 위에 따로 표시돼요. 디자인을 바꾸면 투입구 위치도 다시 정해 주세요.</p>
        </div>
      </div>
    </section>
  );
}
