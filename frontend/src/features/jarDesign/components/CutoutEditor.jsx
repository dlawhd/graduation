import { useEffect, useMemo, useRef, useState } from "react";
import {
  CUTOUT_MAX_POINTS_PER_REGION,
  CUTOUT_MAX_REGIONS,
  cutoutPointAtPointer,
  normalizeCutoutRegions,
  sameCutoutRegions,
  shouldAppendCutoutPoint,
  toCutoutMaskStyle,
} from "../cutoutGeometry.mjs";
import {
  getJarDesignDraftError,
  getJarDesignGenerationPreview,
  getJarDesignOriginalPreview,
  updateJarDesignCutout,
} from "../../../api/jarDesignDraftApi";

/**
 * 선택 이미지에서 남길 영역을 점 선택 또는 자유 그리기로 여러 개 지정한다.
 * 실제 투명 PNG는 Finalize 때 서버가 만들고, 여기서는 같은 다중 영역을 마스크로 미리 보여준다.
 */
export default function CutoutEditor({ draft, previewUrl, disabled, onSaved, onBusyChange, onDirtyChange }) {
  const initialRegions = draft.cutoutRegions?.length ? draft.cutoutRegions : draft.cutoutPoints;
  const [savedRegions, setSavedRegions] = useState(() => normalizeCutoutRegions(initialRegions));
  const [regions, setRegions] = useState(() => normalizeCutoutRegions(initialRegions));
  const [activePoints, setActivePoints] = useState([]);
  const [mode, setMode] = useState("POINT");
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retryUrl, setRetryUrl] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");
  const [backgroundKept, setBackgroundKept] = useState(false);
  const pointerIdRef = useRef(null);
  const activePointsRef = useRef([]);
  const requestInFlightRef = useRef(false);
  const url = retryUrl || previewUrl || "";
  const imageReady = Boolean(url && loadedUrl === url && failedUrl !== url);
  const dirty = !sameCutoutRegions(regions, savedRegions) || activePoints.length > 0;
  const maskStyle = useMemo(() => toCutoutMaskStyle(regions), [regions]);
  const locked = disabled || saving || retrying || !url;

  useEffect(() => {
    activePointsRef.current = activePoints;
  }, [activePoints]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  function pointFromEvent(event) {
    return cutoutPointAtPointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }

  function appendActivePoint(point, force = false) {
    if (!point) return activePointsRef.current;
    const current = activePointsRef.current;
    if (current.length >= CUTOUT_MAX_POINTS_PER_REGION
      || (!force && !shouldAppendCutoutPoint(current, point))) return current;
    const next = [...current, point];
    activePointsRef.current = next;
    setActivePoints(next);
    return next;
  }

  function addCompletedRegion(points) {
    if (points.length < 3 || regions.length >= CUTOUT_MAX_REGIONS) return false;
    setRegions((current) => [...current, points]);
    activePointsRef.current = [];
    setActivePoints([]);
    setBackgroundKept(false);
    return true;
  }

  function handlePointerDown(event) {
    if (locked || event.button !== 0) return;
    event.preventDefault();
    setError("");
    setBackgroundKept(false);
    const point = pointFromEvent(event);

    if (mode === "POINT") {
      appendActivePoint(point, true);
      return;
    }
    if (pointerIdRef.current !== null || regions.length >= CUTOUT_MAX_REGIONS) return;
    activePointsRef.current = point ? [point] : [];
    setActivePoints(activePointsRef.current);
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing(true);
  }

  function handlePointerUp(event) {
    if (mode !== "FREEHAND" || pointerIdRef.current !== event.pointerId) return;
    const completed = appendActivePoint(pointFromEvent(event), true);
    pointerIdRef.current = null;
    setDrawing(false);
    if (!addCompletedRegion(completed)) {
      setError("영역을 닫으려면 세 점 이상이 필요해요. 조금 더 크게 둘러 그려 주세요.");
    }
  }

  function finishPointRegion() {
    if (!addCompletedRegion(activePointsRef.current)) {
      setError("현재 영역을 닫으려면 점을 세 개 이상 찍어 주세요.");
    }
  }

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

  async function saveCutout(nextRegions = regions) {
    if (locked || requestInFlightRef.current) return;
    if (activePointsRef.current.length > 0) {
      setError("그리고 있는 영역을 먼저 닫거나 되돌려 주세요.");
      return;
    }

    const normalized = normalizeCutoutRegions(nextRegions);
    requestInFlightRef.current = true;
    setSaving(true);
    onBusyChange(true);
    setError("");
    try {
      await updateJarDesignCutout(draft.draftId, {
        regions: normalized,
        expectedDesignType: draft.selectedDesignType,
        expectedGenerationId: draft.selectedGenerationId,
      });
      setSavedRegions(normalized);
      setRegions(normalized);
      setBackgroundKept(normalized.length === 0);
      onSaved(normalized);
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      requestInFlightRef.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  }

  function undo() {
    setBackgroundKept(false);
    if (activePointsRef.current.length > 0) {
      const next = activePointsRef.current.slice(0, -1);
      activePointsRef.current = next;
      setActivePoints(next);
      return;
    }
    setRegions((current) => current.slice(0, -1));
  }

  function clearAll() {
    activePointsRef.current = [];
    setActivePoints([]);
    setRegions([]);
    setBackgroundKept(false);
    setError("");
  }

  return (
    <section className="mt-8 border-t border-violet-100 pt-8" aria-label="배경 지우기">
      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">배경 선택</span>
      <h3 className="mt-3 text-xl font-black text-slate-800">남길 본체를 자유롭게 선택해 주세요</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">점을 이어 정밀하게 선택하거나 손으로 둘러 그릴 수 있어요. 떨어진 부분은 새 영역으로 여러 번 추가하세요.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        <div>
          <div
            role="application"
            aria-label="저금통 본체 선택 영역"
            className="relative aspect-square w-full cursor-crosshair touch-none overflow-hidden rounded-xl bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%,transparent_75%,#e2e8f0_75%),linear-gradient(45deg,#e2e8f0_25%,white_25%,white_75%,#e2e8f0_75%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]"
            onPointerDown={handlePointerDown}
            onPointerMove={(event) => {
              if (!locked && mode === "FREEHAND" && pointerIdRef.current === event.pointerId) {
                appendActivePoint(pointFromEvent(event));
              }
            }}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { pointerIdRef.current = null; setDrawing(false); }}
            onLostPointerCapture={() => { pointerIdRef.current = null; setDrawing(false); }}
          >
            {url && <img key={`${url}-${retrying}`} src={url} alt="배경을 지울 선택 디자인" draggable={false}
              className={`pointer-events-none absolute inset-0 h-full w-full select-none object-contain transition-opacity ${regions.length ? "opacity-25" : ""}`}
              onLoad={() => { setFailedUrl(""); setLoadedUrl(url); }}
              onError={() => setFailedUrl(url)} />}
            {imageReady && maskStyle && <img src={url} alt="선택한 본체 미리보기" draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
              style={maskStyle} />}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              {regions.map((region, index) => <polygon key={`region-${index}`}
                points={region.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="rgba(124,58,237,0.13)" stroke="#7c3aed" strokeWidth="0.006" />)}
              {activePoints.length >= 2 && <polyline
                points={activePoints.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none" stroke="#ec4899" strokeWidth="0.007" />}
              {mode === "POINT" && activePoints.map((point, index) => <circle key={`point-${index}`}
                cx={point.x} cy={point.y} r="0.009" fill="#ec4899" stroke="white" strokeWidth="0.003" />)}
            </svg>
            {!imageReady && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/80 p-6 text-center text-sm text-slate-500">
              {failedUrl === url && url ? "이미지를 불러오지 못했어요. 아래에서 다시 불러와 주세요." : "이미지를 불러오는 중이에요."}
            </div>}
            {drawing && <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-violet-700 px-3 py-1 text-xs font-black text-white">영역 그리는 중</span>}
          </div>
          <button type="button" onClick={() => void retryPreview()} disabled={saving || retrying || disabled}
            className="mt-3 min-h-11 text-sm font-bold text-violet-700 disabled:opacity-50">{retrying ? "불러오는 중..." : "이미지 다시 불러오기"}</button>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-violet-50 p-2">
            <button type="button" onClick={() => { activePointsRef.current = []; setActivePoints([]); setMode("POINT"); }} disabled={locked}
              className={`min-h-11 rounded-xl px-3 text-sm font-black ${mode === "POINT" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>점으로 선택</button>
            <button type="button" onClick={() => { activePointsRef.current = []; setActivePoints([]); setMode("FREEHAND"); }} disabled={locked}
              className={`min-h-11 rounded-xl px-3 text-sm font-black ${mode === "FREEHAND" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>자유롭게 그리기</button>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {mode === "POINT"
              ? <p><b>점으로 선택:</b> 본체 테두리를 따라 차례로 클릭한 뒤 현재 영역 닫기를 누르세요.</p>
              : <p><b>자유롭게 그리기:</b> 본체 바깥을 한 바퀴 드래그하고 손을 떼면 영역이 자동으로 닫혀요.</p>}
            <p className="mt-1">분리된 귀·장식·글자는 같은 방식으로 영역을 더 추가할 수 있어요.</p>
          </div>

          <p role="status" className="text-sm text-slate-600">
            {saving ? "선택 영역 저장 중..." : activePoints.length ? `현재 영역 점 ${activePoints.length}개` : regions.length ? `완성된 선택 영역 ${regions.length}개` : backgroundKept ? "배경을 그대로 사용하도록 저장했어요." : "아직 선택한 영역이 없어요."}
          </p>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

          {regions.length > 0 && <div className="flex flex-wrap gap-2">
            {regions.map((_, index) => <button key={`remove-${index}`} type="button"
              onClick={() => { setBackgroundKept(false); setRegions((current) => current.filter((__, regionIndex) => regionIndex !== index)); }}
              disabled={locked} className="rounded-full border border-violet-200 px-3 py-1.5 text-xs font-bold text-violet-700">
              영역 {index + 1} 삭제
            </button>)}
          </div>}

          {mode === "POINT" && <button type="button" onClick={finishPointRegion} disabled={locked || activePoints.length < 3 || regions.length >= CUTOUT_MAX_REGIONS}
            className="min-h-11 w-full rounded-xl border border-pink-200 bg-pink-50 px-4 text-sm font-black text-pink-700 disabled:opacity-50">현재 영역 닫기</button>}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={undo} disabled={locked || (activePoints.length === 0 && regions.length === 0)}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold disabled:opacity-50">마지막 점/영역 되돌리기</button>
            <button type="button" onClick={clearAll} disabled={locked || (activePoints.length === 0 && regions.length === 0)}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold disabled:opacity-50">모두 지우기</button>
            <button type="button" onClick={() => { clearAll(); void saveCutout([]); }} disabled={locked || backgroundKept}
              className="min-h-11 rounded-xl border border-violet-200 px-4 text-sm font-bold text-violet-700 disabled:opacity-50">{backgroundKept ? "배경 그대로 사용 중" : "배경 그대로 사용"}</button>
          </div>

          <button type="button" onClick={() => void saveCutout()} disabled={locked || !dirty || activePoints.length > 0 || regions.length === 0}
            className="min-h-12 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "저장 중..." : `선택 영역 ${regions.length}개 적용`}</button>
          <p className="text-xs leading-5 text-slate-500">최대 {CUTOUT_MAX_REGIONS}개 영역을 추가할 수 있어요. 후보를 바꾸면 선택 영역은 새 이미지에 맞게 초기화됩니다.</p>
        </div>
      </div>
    </section>
  );
}
