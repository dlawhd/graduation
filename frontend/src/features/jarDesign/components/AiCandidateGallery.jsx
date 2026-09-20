import { useEffect, useState } from "react";
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
    if (!draft) {
      setOriginalPreviewUrl("");
      setPreviewUrls({});
      return () => {
        cancelled = true;
      };
    }
    const succeededCandidates = (draft?.generations || []).filter(
      (generation) => generation.status === "SUCCEEDED"
    );
    Promise.all([
      getJarDesignOriginalPreview(draftId)
        .then((preview) => ["original", preview.previewUrl])
        .catch(() => ["original", null]),
      ...succeededCandidates.map(async (generation) => {
        try {
          const preview = await getJarDesignGenerationPreview(draftId, generation.generationId);
          return [generation.generationId, preview.previewUrl];
        } catch {
          return [generation.generationId, null];
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
  }, [draft, draftId]);

  /** 같은 Draft의 PROCESSING 중복 규칙은 서버가 보장하며, 화면도 요청 중 버튼을 잠근다. */
  async function handleGenerate(style) {
    if (generatingStyle) return;
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
    if (selectingGenerationId !== null) return;
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
    if (selectingGenerationId !== null) return;
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

  return (
    <section className="mt-8 rounded-[28px] border border-violet-100 bg-white p-6 shadow-[0_12px_32px_rgba(76,29,149,0.08)] sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-violet-100 px-3 py-1.5 text-xs font-black text-violet-700">AI 후보 보관함</div>
          <h2 className="mt-3 text-2xl font-black text-slate-800">원본을 어떤 분위기로 바꿔볼까요?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">후보는 이 Draft 안에만 보관됩니다. 마음에 드는 결과를 하나 고르면 다음 Slot 편집 단계에서 이어서 사용할 수 있어요.</p>
        </div>
        <button type="button" onClick={() => void loadDraft()} disabled={loading || Boolean(generatingStyle)}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          새로고침
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AI_STYLES.map(([style, title, description]) => (
          <button key={style} type="button" onClick={() => void handleGenerate(style)}
            disabled={Boolean(generatingStyle) || loading}
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
                disabled={selectingGenerationId !== null}
                className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45">
                {draft?.selectedDesignType === "ORIGINAL" ? "선택됨" : selectingGenerationId === "original" ? "선택 저장 중..." : "원본 그대로 선택"}
              </button>
            </div>
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
                    disabled={!isSucceeded || selectingGenerationId !== null}
                    className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45">
                    {isSelected ? "선택됨" : selectingGenerationId === generation.generationId ? "선택 저장 중..." : "이 후보 선택"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function styleLabel(style) {
  return AI_STYLES.find(([value]) => value === style)?.[1] || style;
}
