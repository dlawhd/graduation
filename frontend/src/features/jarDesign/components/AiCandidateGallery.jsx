import { useCallback, useEffect, useRef, useState } from "react";
import { designImageRendering } from "../imageRendering.mjs";
import { getGenerationFailureGuidance } from "../generationFailure.mjs";
import { useStompClient } from "../../../realtime/StompClientProvider";
import { subscribeJarDesignGenerationSocket } from "../../../api/jarDesignGenerationSocketApi";
import SlotEditor from "./SlotEditor";
import CutoutEditor from "./CutoutEditor";
import JarDesignFinalizePanel from "./JarDesignFinalizePanel";
import CandidateComparison from "./CandidateComparison";
import JarDesignImage from "./JarDesignImage";
import { getJarBody } from "../jarBodies.mjs";
import {
  createJarDesignGeneration,
  getJarDesignDraft,
  getJarDesignDraftError,
  getJarDesignGenerationPreview,
  getJarDesignOriginalPreview,
  selectJarDesign,
} from "../../../api/jarDesignDraftApi";

const AI_STYLES = [
  ["CUTE_2D", "귀여운 2D", "말랑하고 사랑스러운 일러스트"],
  ["SOFT_25D", "부드러운 3D", "원본 형태를 살린 입체적인 볼륨과 부드러운 질감"],
  ["WATERCOLOR", "수채화", "번지는 색감의 손그림 분위기"],
  ["HAND_DRAWN", "손그림", "연필과 펜으로 그린 듯한 느낌"],
  ["WEIRDO", "기괴", "원본을 알아볼 수 있는 강렬한 뒤틀림과 초현실적 질감"],
  ["PIXEL", "픽셀", "96×96 격자·최대 64색으로 표현하는 레트로 스타일"],
];

const CONNECTED_SAFETY_REFRESH_MS = 30_000;
// 스타일 식별자는 서버 계약을 유지하고, 화면의 분위기만 각 스타일에 맞게 구분한다.
const STYLE_APPEARANCE = {
  CUTE_2D: { background: "linear-gradient(125deg, #fff1f2, #fce7f3)", border: "#f9a8d4", icon: "✿", color: "#be185d" },
  SOFT_25D: { background: "linear-gradient(125deg, #ede9fe, #dbeafe)", border: "#c4b5fd", icon: "◉", color: "#6d28d9" },
  WATERCOLOR: { background: "linear-gradient(125deg, #e0f2fe, #ccfbf1, #fce7f3)", border: "#99d9df", icon: "◌", color: "#0e7490" },
  HAND_DRAWN: { background: "linear-gradient(125deg, #fffbeb, #fef3c7)", border: "#fcd34d", icon: "✎", color: "#92400e" },
  WEIRDO: { background: "linear-gradient(125deg, #ecfccb, #fae8ff)", border: "#bef264", icon: "✦", color: "#4d7c0f" },
  PIXEL: { background: "linear-gradient(125deg, #e0e7ff, #cffafe)", border: "#a5b4fc", icon: "▦", color: "#4338ca" },
};
const DISCONNECTED_FALLBACK_REFRESH_MS = 3_000;

/**
 * 하나의 Draft에 쌓인 AI 후보를 조회·생성·선택하는 보관함이다.
 * 이미지 URL은 DB 응답에 저장하지 않고, 성공 후보를 렌더링할 때만 별도 Presigned URL을 요청한다.
 */
export default function AiCandidateGallery({ draftId }) {
  const { connected, subscribe } = useStompClient();
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingStyle, setGeneratingStyle] = useState("");
  const [selectingGenerationId, setSelectingGenerationId] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [chosenStyle, setChosenStyle] = useState("CUTE_2D");
  const [styleFilter, setStyleFilter] = useState("ALL");
  const [comparisonId, setComparisonId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const actionInFlight = useRef(false);
  const editorRef = useRef(null);
  const scrollToEditorRef = useRef(false);
  const [slotSaving, setSlotSaving] = useState(false);
  const [slotDirty, setSlotDirty] = useState(false);
  const [cutoutSaving, setCutoutSaving] = useState(false);
  const [cutoutDirty, setCutoutDirty] = useState(false);
  const [previewRefreshVersion, setPreviewRefreshVersion] = useState(0);
  const previewUrlsRef = useRef({});
  const originalPreviewUrlRef = useRef("");
  const wasDisconnectedRef = useRef(false);
  const retriedPreviewUrlsRef = useRef(new Set());
  // 슬롯 저장은 이미지 자체를 바꾸지 않으므로 같은 후보들의 URL을 반복 발급하지 않는다.
  const previewCandidateIds = JSON.stringify((draft?.generations || [])
    .filter((generation) => generation.status === "SUCCEEDED")
    .map((generation) => generation.generationId));
  const draftStatus = draft?.status;
  const body = getJarBody(draft?.bodyStyle);
  useEffect(() => {
    if (!loading && scrollToEditorRef.current && draft?.selectedDesignType) {
      scrollToEditorRef.current = false;
      editorRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }, [loading, draft]);

  function confirmDiscardEdits() {
    if (!slotDirty && !cutoutDirty) return true;
    return window.confirm("아직 저장하지 않은 투입구 또는 배경 지우기 편집이 있어요. 편집 내용을 버리고 계속할까요?");
  }

  const loadDraft = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const nextDraft = await getJarDesignDraft(draftId);
      setDraft(nextDraft);
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    setDraft(null);
    previewUrlsRef.current = {};
    originalPreviewUrlRef.current = "";
    retriedPreviewUrlsRef.current.clear();
    setPreviewUrls({});
    setOriginalPreviewUrl("");
    void loadDraft();
  }, [loadDraft]);

  /** 완료 이벤트는 갱신 신호로만 사용하고 실제 상태는 권한 검사가 적용된 REST 응답으로 다시 맞춘다. */
  useEffect(() => subscribeJarDesignGenerationSocket({
    subscribe,
    draftId,
    onGenerationChanged: (event) => {
      if (Number(event?.draftId) === Number(draftId)) {
        void loadDraft({ showLoading: false });
      }
    },
  }), [draftId, loadDraft, subscribe]);

  /** 연결 중 놓친 이벤트가 있을 수 있으므로 재연결 직후 한 번 서버 상태와 동기화한다. */
  useEffect(() => {
    if (!connected) {
      wasDisconnectedRef.current = true;
      return;
    }
    if (wasDisconnectedRef.current) {
      wasDisconnectedRef.current = false;
      void loadDraft({ showLoading: false });
    }
  }, [connected, loadDraft]);

  const processingGeneration = (draft?.generations || [])
    .find((generation) => generation.status === "PROCESSING");
  const hasProcessingGeneration = Boolean(processingGeneration);

  /** WebSocket이 끊기면 짧게, 연결 중이면 이벤트 유실 대비용으로만 낮은 빈도로 REST를 재확인한다. */
  useEffect(() => {
    if (!hasProcessingGeneration) return undefined;

    let cancelled = false;
    let timerId;
    const delay = connected
      ? CONNECTED_SAFETY_REFRESH_MS
      : DISCONNECTED_FALLBACK_REFRESH_MS;

    async function refreshUntilFinished() {
      await loadDraft({ showLoading: false });
      if (!cancelled) {
        timerId = window.setTimeout(refreshUntilFinished, delay);
      }
    }

    timerId = window.setTimeout(refreshUntilFinished, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [connected, hasProcessingGeneration, loadDraft]);

  useEffect(() => {
    let cancelled = false;
    if (Number(draft?.draftId) !== Number(draftId) || draftStatus !== "ACTIVE") {
      originalPreviewUrlRef.current = "";
      previewUrlsRef.current = {};
      setOriginalPreviewUrl("");
      setPreviewUrls({});
      return () => {
        cancelled = true;
      };
    }
    const succeededCandidateIds = JSON.parse(previewCandidateIds);
    const missingCandidateIds = succeededCandidateIds
      .filter((generationId) => !previewUrlsRef.current[generationId]);
    const previewRequests = [
      ...(originalPreviewUrlRef.current ? [] : [
        getJarDesignOriginalPreview(draftId)
          .then((preview) => ["original", preview.previewUrl])
          .catch(() => ["original", null]),
      ]),
      ...missingCandidateIds.map(async (generationId) => {
        try {
          const preview = await getJarDesignGenerationPreview(draftId, generationId);
          return [generationId, preview.previewUrl];
        } catch {
          return [generationId, null];
        }
      }),
    ];

    if (previewRequests.length === 0) return undefined;

    Promise.all(previewRequests).then((entries) => {
      if (!cancelled) {
        const originalEntry = entries.find(([key]) => key === "original");
        if (originalEntry?.[1]) {
          originalPreviewUrlRef.current = originalEntry[1];
          setOriginalPreviewUrl(originalEntry[1]);
        }

        const candidateEntries = entries.filter(([key, url]) => key !== "original" && Boolean(url));
        if (candidateEntries.length > 0) {
          const nextUrls = Object.fromEntries(candidateEntries);
          previewUrlsRef.current = { ...previewUrlsRef.current, ...nextUrls };
          setPreviewUrls((current) => ({ ...current, ...nextUrls }));
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [draft?.draftId, draftStatus, previewCandidateIds, previewRefreshVersion, draftId]);

  /** 만료되거나 일시 실패한 원본 URL 하나만 다시 발급한다. */
  const refreshOriginalPreview = useCallback(async () => {
    try {
      const preview = await getJarDesignOriginalPreview(draftId);
      originalPreviewUrlRef.current = preview.previewUrl;
      setOriginalPreviewUrl(preview.previewUrl);
    } catch {
      originalPreviewUrlRef.current = "";
      setOriginalPreviewUrl("");
    }
  }, [draftId]);

  /** 새로 성공했거나 만료된 후보 하나만 다시 발급해 기존 후보 이미지의 재다운로드를 막는다. */
  const refreshCandidatePreview = useCallback(async (generationId) => {
    try {
      const preview = await getJarDesignGenerationPreview(draftId, generationId);
      previewUrlsRef.current = { ...previewUrlsRef.current, [generationId]: preview.previewUrl };
      setPreviewUrls((current) => ({ ...current, [generationId]: preview.previewUrl }));
    } catch {
      const nextUrls = { ...previewUrlsRef.current };
      delete nextUrls[generationId];
      previewUrlsRef.current = nextUrls;
      setPreviewUrls(nextUrls);
    }
  }, [draftId]);

  /** 같은 만료 URL에서 연속 error 이벤트가 발생해 Presign API가 반복 호출되는 것을 막는다. */
  function handlePreviewError(failedUrl, refreshPreview) {
    if (!failedUrl || retriedPreviewUrlsRef.current.has(failedUrl)) return;
    retriedPreviewUrlsRef.current.add(failedUrl);
    void refreshPreview();
  }

  /** 사용자가 누른 새로고침은 Draft와 현재 실패한 미리보기만 다시 요청한다. */
  async function handleManualRefresh() {
    if (!confirmDiscardEdits()) return;
    setError("");
    retriedPreviewUrlsRef.current.clear();
    setPreviewRefreshVersion((current) => current + 1);
    await loadDraft();
  }

  /** 같은 Draft의 PROCESSING 중복 규칙은 서버가 보장하며, 화면도 요청 중 버튼을 잠근다. */
  async function handleGenerate(style) {
    if (actionInFlight.current || finalizing || hasProcessingGeneration || generatingStyle || slotSaving || cutoutSaving || !confirmDiscardEdits()) return;
    actionInFlight.current = true;
    setGeneratingStyle(style);
    setError("");
    try {
      await createJarDesignGeneration(draftId, style);
      await loadDraft({ showLoading: false });
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setGeneratingStyle("");
      actionInFlight.current = false;
    }
  }

  /** 성공·미정리 후보만 선택 API로 전달하며, 성공 뒤 서버 상태를 다시 읽는다. */
  async function handleSelect(generationId) {
    if (actionInFlight.current || finalizing || selectingGenerationId !== null || slotSaving || cutoutSaving || !confirmDiscardEdits()) return;
    actionInFlight.current = true;
    setSelectingGenerationId(generationId);
    setError("");
    try {
      await selectJarDesign(draftId, "AI", generationId);
      scrollToEditorRef.current = true;
      await loadDraft();
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setSelectingGenerationId(null);
      actionInFlight.current = false;
    }
  }

  /** 정규화 원본도 AI 후보와 같은 Draft 선택 계약으로 저장한다. */
  async function handleSelectOriginal() {
    if (actionInFlight.current || finalizing || selectingGenerationId !== null || slotSaving || cutoutSaving || !confirmDiscardEdits()) return;
    actionInFlight.current = true;
    setSelectingGenerationId("original");
    setError("");
    try {
      await selectJarDesign(draftId, "ORIGINAL");
      scrollToEditorRef.current = true;
      await loadDraft();
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setSelectingGenerationId(null);
      actionInFlight.current = false;
    }
  }

  /** 직접 디자인을 쓰지 않기로 한 경우에도 Draft Finalize API 안에서 기존 Jar 생성 로직을 재사용한다. */
  async function handleSelectDefault() {
    if (actionInFlight.current || finalizing || selectingGenerationId !== null || slotSaving || cutoutSaving || !confirmDiscardEdits()) return;
    actionInFlight.current = true;
    setSelectingGenerationId("default");
    setError("");
    try {
      await selectJarDesign(draftId, "DEFAULT");
      scrollToEditorRef.current = true;
      await loadDraft();
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setSelectingGenerationId(null);
      actionInFlight.current = false;
    }
  }

  return (
    <section inert={finalizing || undefined} className="mt-8 rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_12px_32px_rgba(76,29,149,0.08)] sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-violet-100 px-3 py-1.5 text-xs font-black text-violet-700">{body ? "03" : "01"} · 디자인 고르기</div>
          <h2 className="mt-3 text-2xl font-black text-slate-800">원본을 어떤 분위기로 바꿔볼까요?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">마음에 드는 스타일을 고르고 한 장씩 만들어보세요. 원본과 비교한 뒤, 가장 마음에 드는 그림으로 계속할 수 있어요.</p>
        </div>
        <button type="button" onClick={() => void handleManualRefresh()} disabled={loading || Boolean(generatingStyle) || slotSaving || cutoutSaving || selectingGenerationId !== null}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          새로고침
        </button>
      </div>

      {body && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900"><strong>{body.name}</strong> 안에 담을 그림을 골라요. AI는 그림만 꾸미고 저금통 모양은 그대로 유지돼요.</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AI_STYLES.map(([style, title, description]) => (
          <button key={style} type="button" aria-pressed={chosenStyle === style} onClick={() => setChosenStyle(style)}
            disabled={Boolean(generatingStyle) || hasProcessingGeneration || loading || slotSaving || cutoutSaving || selectingGenerationId !== null}
            style={{ background: STYLE_APPEARANCE[style].background, borderColor: STYLE_APPEARANCE[style].border }}
            className={`group relative rounded-2xl border p-4 text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-md focus-visible:outline-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-60 ${chosenStyle === style ? "ring-2 ring-violet-500 ring-offset-2" : ""}`}>
            <span aria-hidden="true" style={{ color: STYLE_APPEARANCE[style].color }} className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 text-3xl shadow-sm">{STYLE_APPEARANCE[style].icon}</span>
            <p className="text-sm font-black text-slate-800">{generatingStyle === style || processingGeneration?.style === style ? "생성 중..." : title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
            <span className="mt-3 inline-block text-xs font-bold" style={{ color: STYLE_APPEARANCE[style].color }}>{generatingStyle === style || processingGeneration?.style === style ? "디자인을 만들고 있어요" : chosenStyle === style ? "선택한 스타일 ✓" : "스타일 선택"}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-violet-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600"><strong className="text-violet-800">{styleLabel(chosenStyle)}</strong>로 나만의 그림을 꾸며요.<br /><span className="text-xs text-slate-500">한 번에 한 장씩 생성해요. 완료되면 아래에 나타나요.</span></p>
        <button type="button" disabled={Boolean(generatingStyle) || hasProcessingGeneration || loading || slotSaving || cutoutSaving || selectingGenerationId !== null || draft?.status !== "ACTIVE"}
          onClick={() => void handleGenerate(chosenStyle)} className="min-h-12 shrink-0 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-sm disabled:opacity-50">{generatingStyle || hasProcessingGeneration ? "그림을 만드는 중…" : "선택한 스타일로 한 장 만들기 ✦"}</button>
      </div>

      {hasProcessingGeneration && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          {connected
            ? "AI가 백그라운드에서 디자인을 만들고 있어요. 완료되면 이 화면이 자동으로 갱신됩니다."
            : "AI 디자인은 계속 생성 중이에요. 실시간 연결을 복구하는 동안 상태를 자동으로 확인합니다."}
        </p>
      )}

      {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><h3 className="font-black text-slate-800">내 디자인 보관함 <span className="text-violet-500">{(draft?.generations || []).filter((g) => g.status === "SUCCEEDED").length + 1}</span></h3>
        <label className="text-xs font-bold text-slate-500">후보 필터 <select value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)} className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="ALL">모든 스타일</option>{AI_STYLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div>

      {loading ? (
        <p className="mt-6 text-sm font-semibold text-slate-500">후보 보관함을 불러오는 중이에요...</p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <article className={`overflow-hidden rounded-[22px] border bg-white ${draft?.selectedDesignType === "ORIGINAL" ? "border-violet-500 ring-2 ring-violet-100" : "border-slate-200"}`}>
            <div className="aspect-square bg-slate-100">
              {originalPreviewUrl ? (
                <JarDesignImage bodyStyle={draft?.bodyStyle} imageUrl={originalPreviewUrl} alt="정규화한 원본 디자인" showDefaultSlot
                  onImageError={() => handlePreviewError(originalPreviewUrl, refreshOriginalPreview)} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold leading-6 text-slate-500">
                  원본 미리보기를 준비하는 중이에요.
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-black text-slate-800">내 원본 그대로</p>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700">ORIGINAL</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">서버에서 480×480 PNG로 정규화한 원본이에요.</p>
              <button type="button" onClick={() => void handleSelectOriginal()}
                disabled={selectingGenerationId !== null || slotSaving || cutoutSaving || Boolean(generatingStyle) || draft?.selectedDesignType === "ORIGINAL"}
                className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45">
                {draft?.selectedDesignType === "ORIGINAL" ? "선택됨" : selectingGenerationId === "original" ? "선택 저장 중..." : "원본 그대로 선택"}
              </button>
            </div>
          </article>
          {!(draft?.generations || []).some((generation) => styleFilter === "ALL" || generation.style === styleFilter) && <div className="flex min-h-48 flex-col items-center justify-center rounded-[22px] border border-dashed border-violet-200 bg-violet-50/40 p-6 text-center sm:col-span-1 xl:col-span-2"><span className="text-3xl text-violet-300" aria-hidden="true">✦</span><p className="mt-3 font-bold text-slate-700">{styleFilter === "ALL" ? "어떤 모습이 될지 궁금한가요?" : "이 스타일의 후보가 아직 없어요"}</p><p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">위에서 스타일을 골라 첫 후보를 만들어보세요. AI 없이 원본을 그대로 선택해도 좋아요.</p></div>}
          {(draft?.generations || []).filter((generation) => styleFilter === "ALL" || generation.style === styleFilter).map((generation) => {
            const isSucceeded = generation.status === "SUCCEEDED";
            const isFailed = generation.status === "FAILED";
            const failure = isFailed ? getGenerationFailureGuidance(generation.errorCode) : null;
            const isSelected = draft.selectedDesignType === "AI" && draft.selectedGenerationId === generation.generationId;
            const previewUrl = previewUrls[generation.generationId];
            return (
              <article key={generation.generationId}
                className={`overflow-hidden rounded-[22px] border bg-white ${isSelected ? "border-violet-500 ring-2 ring-violet-100" : "border-slate-200"}`}>
                <div className="aspect-square bg-slate-100">
                  {isSucceeded && previewUrl ? (
                    <JarDesignImage bodyStyle={draft?.bodyStyle} imageUrl={previewUrl} alt={`${styleLabel(generation.style)} AI 후보`} showDefaultSlot
                      imageRendering={designImageRendering(generation.style)}
                      onImageError={() => handlePreviewError(
                        previewUrl,
                        () => refreshCandidatePreview(generation.generationId),
                      )} />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold leading-6 text-slate-500">
                      {isSucceeded ? "미리보기를 준비하는 중이에요." : generation.status === "PROCESSING" ? "AI가 디자인을 만드는 중이에요." : failure?.title || "후보 상태를 확인하고 있어요."}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-slate-800">{styleLabel(generation.style)}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isSucceeded ? "bg-emerald-50 text-emerald-700" : generation.status === "FAILED" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`}>
                      {isSucceeded ? "완성" : generation.status === "PROCESSING" ? "만드는 중" : failure?.badge || "상태 확인"}
                    </span>
                  </div>
                  {failure && <div className="mt-3 rounded-xl bg-rose-50 p-3" role="status">
                    <p className="text-xs font-semibold leading-5 text-rose-700">{failure.message}</p>
                    <p className="mt-2 break-words text-[11px] leading-4 text-slate-500">확인 코드: {failure.diagnosticCode} · 후보 #{generation.generationId}</p>
                  </div>}
                  {isSucceeded && previewUrl && originalPreviewUrl && <button type="button" onClick={() => setComparisonId(generation.generationId)} className="mt-3 w-full rounded-xl border border-violet-200 px-3 py-2.5 text-sm font-bold text-violet-700">확대 · 원본과 비교</button>}
                  {failure?.canRetry ? <button type="button" onClick={() => void handleGenerate(generation.style)}
                    disabled={loading || hasProcessingGeneration || selectingGenerationId !== null || slotSaving || cutoutSaving || Boolean(generatingStyle) || draft?.status !== "ACTIVE"}
                    className="mt-4 min-h-11 w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-black text-violet-700 disabled:cursor-not-allowed disabled:opacity-45">
                    이 스타일로 다시 시도
                  </button> : <button type="button" onClick={() => void handleSelect(generation.generationId)}
                    disabled={!isSucceeded || selectingGenerationId !== null || slotSaving || cutoutSaving || Boolean(generatingStyle) || isSelected}
                    className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45">
                    {isSelected ? "선택됨" : selectingGenerationId === generation.generationId ? "선택 저장 중..." : isFailed ? "선택할 수 없는 후보" : "이 후보 선택"}
                  </button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><p className="text-xs leading-5 text-slate-500">직접 그린 디자인 대신, 기본 테마 저금통을 써도 좋아요.</p><button type="button" onClick={() => void handleSelectDefault()} disabled={loading || selectingGenerationId !== null || slotSaving || cutoutSaving || Boolean(generatingStyle) || draft?.selectedDesignType === "DEFAULT"} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 disabled:opacity-50">{draft?.selectedDesignType === "DEFAULT" ? "기본 저금통 선택됨 ✓" : "기본 저금통으로 계속하기 →"}</button></div>
      {comparisonId !== null && (() => { const candidate = draft?.generations?.find((g) => g.generationId === comparisonId); return candidate && <CandidateComparison bodyStyle={draft?.bodyStyle} originalUrl={originalPreviewUrl} candidateUrl={previewUrls[comparisonId]} title={styleLabel(candidate.style)} style={candidate.style} disabled={selectingGenerationId !== null || slotSaving || cutoutSaving || hasProcessingGeneration}
        onClose={() => setComparisonId(null)} onSelect={() => { setComparisonId(null); void handleSelect(comparisonId); }} />; })()}
      <div ref={editorRef} className="scroll-mt-24" />
      {!loading && draft?.status === "ACTIVE" && ["ORIGINAL", "AI"].includes(draft.selectedDesignType) && (
        <SlotEditor
          key={`${draft.draftId}:${draft.selectedDesignType}:${draft.selectedGenerationId}:${draft.slotCenterX}:${draft.slotCenterY}:${draft.slotSizeRatio}:${draft.slotStyle}`}
          draft={draft}
          previewUrl={draft.selectedDesignType === "ORIGINAL" ? originalPreviewUrl : previewUrls[draft.selectedGenerationId]}
          cutoutRegions={draft.cutoutRegions?.length ? draft.cutoutRegions : draft.cutoutPoints}
          disabled={Boolean(generatingStyle) || selectingGenerationId !== null || cutoutSaving || cutoutDirty}
          onBusyChange={setSlotSaving}
          onDirtyChange={setSlotDirty}
          onSaved={(slot) => setDraft((current) => ({ ...current,
            slotCenterX: slot.centerX, slotCenterY: slot.centerY, slotSizeRatio: slot.sizeRatio, slotStyle: slot.slotStyle || "CAPSULE" }))}
        />
      )}
      {!loading && draft?.status === "ACTIVE" && ["ORIGINAL", "AI"].includes(draft.selectedDesignType) && (
        <div>
        {body && <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">아래 배경 편집은 저금통 안에 담긴 그림에만 적용돼요. 본체는 지워지지 않아요.</p>}
        <CutoutEditor
          key={`${draft.draftId}:${draft.selectedDesignType}:${draft.selectedGenerationId}:${JSON.stringify(draft.cutoutRegions || draft.cutoutPoints || [])}`}
          draft={draft}
          previewUrl={draft.selectedDesignType === "ORIGINAL" ? originalPreviewUrl : previewUrls[draft.selectedGenerationId]}
          disabled={Boolean(generatingStyle) || selectingGenerationId !== null || slotSaving}
          onBusyChange={setCutoutSaving}
          onDirtyChange={setCutoutDirty}
          onSaved={(regions) => setDraft((current) => ({ ...current,
            cutoutRegions: regions, cutoutPoints: regions[0] || [] }))}
        />
        </div>
      )}
      {!loading && draft && (draft.status === "FINALIZED" || (draft.status === "ACTIVE" && ["ORIGINAL", "AI", "DEFAULT"].includes(draft.selectedDesignType))) && (
        <JarDesignFinalizePanel
          draft={draft}
          previewUrl={draft.selectedDesignType === "ORIGINAL" ? originalPreviewUrl : previewUrls[draft.selectedGenerationId]}
          slotDirty={slotDirty}
          slotSaving={slotSaving}
          cutoutDirty={cutoutDirty}
          cutoutSaving={cutoutSaving}
          disabled={Boolean(generatingStyle) || selectingGenerationId !== null}
          onRefresh={() => void loadDraft()}
          onBusyChange={setFinalizing}
        />
      )}
    </section>
  );
}

function styleLabel(style) {
  return AI_STYLES.find(([value]) => value === style)?.[1] || style;
}
