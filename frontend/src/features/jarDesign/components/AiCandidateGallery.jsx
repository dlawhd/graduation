import { useEffect, useState } from "react";
import SlotEditor from "./SlotEditor";
import JarDesignFinalizePanel from "./JarDesignFinalizePanel";
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
  ["SOFT_25D", "부드러운 2.5D", "은은한 입체감과 따뜻한 질감"],
  ["WATERCOLOR", "수채화", "번지는 색감의 손그림 분위기"],
  ["HAND_DRAWN", "손그림", "연필과 펜으로 그린 듯한 느낌"],
  ["WEIRDO", "괴짜", "개성 있고 엉뚱한 표현"],
  ["PIXEL", "픽셀", "24색 픽셀 후처리를 거친 레트로 스타일"],
];

/**
 * 하나의 Draft에 쌓인 AI 후보를 조회·생성·선택하는 보관함이다.
 * 이미지 URL은 DB 응답에 저장하지 않고, 성공 후보를 렌더링할 때만 별도 Presigned URL을 요청한다.
 */
export default function AiCandidateGallery({ draftId }) {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingStyle, setGeneratingStyle] = useState("");
  const [selectingGenerationId, setSelectingGenerationId] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [slotSaving, setSlotSaving] = useState(false);
  const [slotDirty, setSlotDirty] = useState(false);
  // 슬롯 저장은 이미지 자체를 바꾸지 않으므로 같은 후보들의 URL을 반복 발급하지 않는다.
  const previewCandidateIds = JSON.stringify((draft?.generations || [])
    .filter((generation) => generation.status === "SUCCEEDED")
    .map((generation) => generation.generationId));
  const draftStatus = draft?.status;

  function confirmDiscardSlot() {
    return !slotDirty || window.confirm("아직 저장하지 않은 투입구 편집이 있어요. 편집 내용을 버리고 계속할까요?");
  }

  async function loadDraft() {
    setLoading(true);
    setError("");
    try {
      const nextDraft = await getJarDesignDraft(draftId);
      setDraft(nextDraft);
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDraft();
  }, [draftId]);

  useEffect(() => {
    let cancelled = false;
    if (draftStatus !== "ACTIVE") {
      setOriginalPreviewUrl("");
      setPreviewUrls({});
      return () => {
        cancelled = true;
      };
    }
    const succeededCandidateIds = JSON.parse(previewCandidateIds);
    Promise.all([
      getJarDesignOriginalPreview(draftId)
        .then((preview) => ["original", preview.previewUrl])
        .catch(() => ["original", null]),
      ...succeededCandidateIds.map(async (generationId) => {
        try {
          const preview = await getJarDesignGenerationPreview(draftId, generationId);
          return [generationId, preview.previewUrl];
        } catch {
          return [generationId, null];
        }
      }),
    ]).then((entries) => {
      if (!cancelled) {
        const [originalEntry, ...candidateEntries] = entries;
        setOriginalPreviewUrl(originalEntry[1] || "");
        setPreviewUrls(Object.fromEntries(candidateEntries.filter(([, url]) => Boolean(url))));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [draftStatus, previewCandidateIds, draftId]);

  /** 같은 Draft의 PROCESSING 중복 규칙은 서버가 보장하며, 화면도 요청 중 버튼을 잠근다. */
  async function handleGenerate(style) {
    if (generatingStyle || slotSaving || !confirmDiscardSlot()) return;
    setGeneratingStyle(style);
    setError("");
    try {
      await createJarDesignGeneration(draftId, style);
      await loadDraft();
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setGeneratingStyle("");
    }
  }

  /** 성공·미정리 후보만 선택 API로 전달하며, 성공 뒤 서버 상태를 다시 읽는다. */
  async function handleSelect(generationId) {
    if (selectingGenerationId !== null || slotSaving || !confirmDiscardSlot()) return;
    setSelectingGenerationId(generationId);
    setError("");
    try {
      await selectJarDesign(draftId, "AI", generationId);
      await loadDraft();
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setSelectingGenerationId(null);
    }
  }

  /** 정규화 원본도 AI 후보와 같은 Draft 선택 계약으로 저장한다. */
  async function handleSelectOriginal() {
    if (selectingGenerationId !== null || slotSaving || !confirmDiscardSlot()) return;
    setSelectingGenerationId("original");
    setError("");
    try {
      await selectJarDesign(draftId, "ORIGINAL");
      await loadDraft();
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setSelectingGenerationId(null);
    }
  }

  /** 직접 디자인을 쓰지 않기로 한 경우에도 Draft Finalize API 안에서 기존 Jar 생성 로직을 재사용한다. */
  async function handleSelectDefault() {
    if (selectingGenerationId !== null || slotSaving || !confirmDiscardSlot()) return;
    setSelectingGenerationId("default");
    setError("");
    try {
      await selectJarDesign(draftId, "DEFAULT");
      await loadDraft();
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setSelectingGenerationId(null);
    }
  }

  return (
    <section className="mt-8 rounded-[28px] border border-violet-100 bg-white p-6 shadow-[0_12px_32px_rgba(76,29,149,0.08)] sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-violet-100 px-3 py-1.5 text-xs font-black text-violet-700">AI 후보 보관함</div>
          <h2 className="mt-3 text-2xl font-black text-slate-800">원본을 어떤 분위기로 바꿔볼까요?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">후보는 이 Draft 안에만 보관됩니다. 마음에 드는 결과를 하나 고르면 다음 Slot 편집 단계에서 이어서 사용할 수 있어요.</p>
        </div>
        <button type="button" onClick={() => { if (confirmDiscardSlot()) void loadDraft(); }} disabled={loading || Boolean(generatingStyle) || slotSaving || selectingGenerationId !== null}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          새로고침
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AI_STYLES.map(([style, title, description]) => (
          <button key={style} type="button" onClick={() => void handleGenerate(style)}
            disabled={Boolean(generatingStyle) || loading || slotSaving || selectingGenerationId !== null}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50">
            <p className="text-sm font-black text-slate-800">{generatingStyle === style ? "생성 중..." : title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
          </button>
        ))}
      </div>

      {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      {loading ? (
        <p className="mt-6 text-sm font-semibold text-slate-500">후보 보관함을 불러오는 중이에요...</p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <article className={`overflow-hidden rounded-[22px] border bg-white ${draft?.selectedDesignType === "ORIGINAL" ? "border-violet-500 ring-2 ring-violet-100" : "border-slate-200"}`}>
            <div className="aspect-square bg-slate-100">
              {originalPreviewUrl ? (
                <img src={originalPreviewUrl} alt="정규화한 원본 디자인" className="h-full w-full object-cover" />
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
                disabled={selectingGenerationId !== null || slotSaving || Boolean(generatingStyle) || draft?.selectedDesignType === "ORIGINAL"}
                className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45">
                {draft?.selectedDesignType === "ORIGINAL" ? "선택됨" : selectingGenerationId === "original" ? "선택 저장 중..." : "원본 그대로 선택"}
              </button>
            </div>
          </article>
          <article className={`flex flex-col rounded-[22px] border p-4 ${draft?.selectedDesignType === "DEFAULT" ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-2xl bg-white p-5 text-center">
              <span className="text-4xl" aria-hidden="true">🫙</span>
              <p className="mt-3 font-black text-slate-800">기본 저금통으로 만들기</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">커스텀 이미지 없이 기존 테마 저금통을 사용할 수 있어요.</p>
            </div>
            <button type="button" onClick={() => void handleSelectDefault()}
              disabled={selectingGenerationId !== null || slotSaving || Boolean(generatingStyle) || draft?.selectedDesignType === "DEFAULT"}
              className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45">
              {draft?.selectedDesignType === "DEFAULT" ? "선택됨" : selectingGenerationId === "default" ? "선택 저장 중..." : "기본 저금통 선택"}
            </button>
          </article>
          {(draft?.generations || []).map((generation) => {
            const isSucceeded = generation.status === "SUCCEEDED";
            const isSelected = draft.selectedDesignType === "AI" && draft.selectedGenerationId === generation.generationId;
            const previewUrl = previewUrls[generation.generationId];
            return (
              <article key={generation.generationId}
                className={`overflow-hidden rounded-[22px] border bg-white ${isSelected ? "border-violet-500 ring-2 ring-violet-100" : "border-slate-200"}`}>
                <div className="aspect-square bg-slate-100">
                  {isSucceeded && previewUrl ? (
                    <img src={previewUrl} alt={`${styleLabel(generation.style)} AI 후보`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold leading-6 text-slate-500">
                      {isSucceeded ? "미리보기를 준비하는 중이에요." : generation.status === "PROCESSING" ? "AI가 디자인을 만드는 중이에요." : "후보 생성에 실패했어요."}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-slate-800">{styleLabel(generation.style)}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isSucceeded ? "bg-emerald-50 text-emerald-700" : generation.status === "FAILED" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`}>
                      {generation.status}
                    </span>
                  </div>
                  {generation.errorCode && <p className="mt-2 text-xs font-semibold text-rose-600">{generation.errorCode}</p>}
                  <button type="button" onClick={() => void handleSelect(generation.generationId)}
                    disabled={!isSucceeded || selectingGenerationId !== null || slotSaving || Boolean(generatingStyle) || isSelected}
                    className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45">
                    {isSelected ? "선택됨" : selectingGenerationId === generation.generationId ? "선택 저장 중..." : "이 후보 선택"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!loading && draft?.status === "ACTIVE" && ["ORIGINAL", "AI"].includes(draft.selectedDesignType) && (
        <SlotEditor
          key={`${draft.draftId}:${draft.selectedDesignType}:${draft.selectedGenerationId}:${draft.slotCenterX}:${draft.slotCenterY}:${draft.slotSizeRatio}`}
          draft={draft}
          previewUrl={draft.selectedDesignType === "ORIGINAL" ? originalPreviewUrl : previewUrls[draft.selectedGenerationId]}
          disabled={Boolean(generatingStyle) || selectingGenerationId !== null}
          onBusyChange={setSlotSaving}
          onDirtyChange={setSlotDirty}
          onSaved={(slot) => setDraft((current) => ({ ...current,
            slotCenterX: slot.centerX, slotCenterY: slot.centerY, slotSizeRatio: slot.sizeRatio }))}
        />
      )}
      {!loading && draft && (draft.status === "FINALIZED" || (draft.status === "ACTIVE" && ["ORIGINAL", "AI", "DEFAULT"].includes(draft.selectedDesignType))) && (
        <JarDesignFinalizePanel
          draft={draft}
          previewUrl={draft.selectedDesignType === "ORIGINAL" ? originalPreviewUrl : previewUrls[draft.selectedGenerationId]}
          slotDirty={slotDirty}
          slotSaving={slotSaving}
          disabled={Boolean(generatingStyle) || selectingGenerationId !== null}
          onRefresh={() => void loadDraft()}
        />
      )}
    </section>
  );
}

function styleLabel(style) {
  return AI_STYLES.find(([value]) => value === style)?.[1] || style;
}
