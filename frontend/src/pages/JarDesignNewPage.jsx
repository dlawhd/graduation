import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import JarDesignCanvas from "../features/jarDesign/components/JarDesignCanvas";
import AiCandidateGallery from "../features/jarDesign/components/AiCandidateGallery";
import {
  createJarDesignDraft,
  getJarDesignDraftError,
} from "../api/jarDesignDraftApi";

/** Canvas 또는 외부 원본으로 Draft를 만들고 AI 후보 보관함으로 이어지는 별도 사전 디자인 화면이다. */
export default function JarDesignNewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputMode, setInputMode] = useState("DRAW");
  const [sourceImage, setSourceImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [draftId, setDraftId] = useState(() => parseDraftId(searchParams.get("draft")));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sourceImage) {
      setPreviewUrl("");
      return undefined;
    }
    const nextPreviewUrl = URL.createObjectURL(sourceImage);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [sourceImage]);

  /** 새 원본을 고르면 이전 Draft로 이어지는 URL을 지워 잘못된 후보를 섞지 않는다. */
  function setDesignSource(imageFile) {
    setSourceImage(imageFile);
    setDraftId(null);
    setSearchParams({});
    setError("");
  }

  /** 파일 선택은 사용성을 위한 사전 안내이며, 실제 PNG/JPEG/WebP·단일 프레임 검증은 서버가 책임진다. */
  function handleExternalImageChange(event) {
    const imageFile = event.target.files?.[0];
    event.target.value = "";
    if (!imageFile) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(imageFile.type)) {
      setError("PNG, JPEG, WebP 이미지 파일만 선택할 수 있어요.");
      return;
    }
    if (imageFile.size > 10 * 1024 * 1024) {
      setError("원본 이미지는 10MB를 초과할 수 없어요.");
      return;
    }
    setDesignSource(imageFile);
  }

  /** Draft가 성공적으로 저장된 뒤에만 URL에 ID를 남겨 새로고침 후에도 후보 보관함을 복원한다. */
  async function handleCreateDraft() {
    if (!sourceImage || saving) return;
    setSaving(true);
    setError("");
    try {
      const draft = await createJarDesignDraft(sourceImage);
      setDraftId(draft.draftId);
      setSearchParams({ draft: String(draft.draftId) });
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#f8f4ef] px-5 py-10 sm:px-6">
      <main className="mx-auto max-w-6xl">
        <Link to="/jars/new" className="text-sm font-bold text-violet-700 hover:text-violet-900">← 기본 저금통 만들기로 돌아가기</Link>
        <section className="mt-4 rounded-[28px] bg-gradient-to-br from-violet-100 via-white to-pink-100 p-7 shadow-[0_12px_36px_rgba(76,29,149,0.12)] sm:p-10">
          <span className="inline-flex rounded-full bg-white/80 px-4 py-2 text-xs font-black text-violet-700">Memory Jar 디자인 스튜디오</span>
          <h1 className="mt-4 text-3xl font-black text-slate-800 sm:text-4xl">나만의 저금통을 먼저 디자인해 보세요</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">원본을 저장하고 AI 후보를 비교한 뒤, 다음 단계에서 동전 투입구 위치와 최종 저금통 정보를 정합니다. 아직 Jar는 만들어지지 않아요.</p>
        </section>

        {!draftId && (
          <section className="mt-8 rounded-[28px] border border-white bg-white/80 p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="디자인 원본 입력 방식">
              <button type="button" role="tab" aria-selected={inputMode === "DRAW"} onClick={() => setInputMode("DRAW")}
                className={`rounded-xl px-4 py-2.5 text-sm font-black ${inputMode === "DRAW" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>직접 그리기</button>
              <button type="button" role="tab" aria-selected={inputMode === "UPLOAD"} onClick={() => setInputMode("UPLOAD")}
                className={`rounded-xl px-4 py-2.5 text-sm font-black ${inputMode === "UPLOAD" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>이미지 불러오기</button>
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              {inputMode === "DRAW" ? <JarDesignCanvas disabled={saving} onConfirm={setDesignSource} /> : (
                <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-violet-200 bg-violet-50/40 p-6 text-center hover:border-violet-400">
                  <span className="text-4xl">🖼️</span><span className="mt-3 font-black text-slate-800">외부 이미지 선택</span>
                  <span className="mt-2 text-xs leading-5 text-slate-500">PNG, JPEG, WebP · 최대 10MB<br />애니메이션 이미지는 사용할 수 없어요.</span>
                  <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={handleExternalImageChange} />
                </label>
              )}
              <aside className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-black text-slate-800">선택한 원본</h2>
                {previewUrl ? <img src={previewUrl} alt="선택한 디자인 원본 미리보기" className="mt-3 aspect-square w-full rounded-2xl border border-slate-100 object-contain" /> : <div className="mt-3 flex aspect-square items-center justify-center rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">그림을 확정하거나 이미지를 선택해 주세요.</div>}
                <button type="button" disabled={!sourceImage || saving} onClick={() => void handleCreateDraft()}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "초안 저장 중..." : "디자인 초안 저장"}</button>
              </aside>
            </div>
          </section>
        )}

        {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}
        {draftId && <AiCandidateGallery key={draftId} draftId={draftId} />}
      </main>
    </div>
  );
}

function parseDraftId(value) {
  const draftId = Number(value);
  return Number.isSafeInteger(draftId) && draftId > 0 ? draftId : null;
}
