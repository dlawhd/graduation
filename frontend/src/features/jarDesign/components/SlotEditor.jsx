import { useEffect, useRef, useState } from "react";
import { getJarDesignDraftError, getJarDesignOriginalPreview, getJarDesignGenerationPreview,
  updateJarDesignSlot } from "../../../api/jarDesignDraftApi";
import { DEFAULT_SLOT, normalizeSlot, sameSlot, slotAtPointer, storedSlot } from "../slotGeometry.mjs";
import JarSlotOverlay from "./JarSlotOverlay";

/** 선택한 원본/AI 이미지 위에 투입구를 배치하고 Draft에 위치·크기만 저장하는 편집기다. */
export default function SlotEditor({ draft, previewUrl, disabled, onSaved, onBusyChange, onDirtyChange }) {
  const [savedSlot, setSavedSlot] = useState(() => storedSlot(draft));
  const [slot, setSlot] = useState(() => normalizeSlot(storedSlot(draft) || DEFAULT_SLOT));
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
      <h3 className="text-xl font-black text-slate-800">동전 투입구를 놓아주세요</h3>
      <p id="slot-editor-help" className="mt-2 text-sm leading-6 text-slate-500">그림을 누르거나 드래그해 위치를 정해 주세요. 방향키로도 움직일 수 있어요.</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        <div>
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
            {url && <img key={`${url}-${retrying}`} src={url} alt="투입구를 배치할 선택 디자인" draggable={false}
              className="h-full w-full select-none object-contain"
              onLoad={(event) => {
                // 잘못된 이미지 비율 위에서 좌표를 저장하지 않는다. 서버 결과는 모두 정사각형이다.
                if (event.currentTarget.naturalWidth === event.currentTarget.naturalHeight) setLoadedUrl(url);
                else setFailedUrl(url);
              }} onError={() => setFailedUrl(url)} />}
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
            <button type="button" onClick={() => setSlot({ ...DEFAULT_SLOT })}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold">가운데로 초기화</button>
          </fieldset>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <p role="status" className="text-sm text-slate-600">{saving ? "투입구 저장 중..." : dirty ? "위치와 크기를 정한 뒤 저장해 주세요." : "투입구 위치와 크기가 저장됐어요."}</p>
          <button type="button" onClick={() => void saveSlot()} disabled={locked || !dirty}
            className="min-h-12 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "저장 중..." : "투입구 저장"}</button>
          <p className="text-xs leading-5 text-slate-500">투입구는 그림 위에 따로 표시돼요. 디자인을 바꾸면 투입구 위치도 다시 정해 주세요.</p>
        </div>
      </div>
    </section>
  );
}
