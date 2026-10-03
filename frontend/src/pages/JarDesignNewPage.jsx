import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import JarDesignCanvas from "../features/jarDesign/components/JarDesignCanvas";
import AiCandidateGallery from "../features/jarDesign/components/AiCandidateGallery";
import JarBodyPicker from "../features/jarDesign/components/JarBodyPicker";
import JarDesignImage from "../features/jarDesign/components/JarDesignImage";
import { getJarBody } from "../features/jarDesign/jarBodies.mjs";
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
  // URL에서 단계를 읽어 새로고침과 브라우저 뒤로 가기도 같은 선택으로 복원한다. 파일은 메모리에만 둔다.
  const draftId = parseDraftId(searchParams.get("draft"));
  const body = getJarBody(searchParams.get("body"));
  const imageStep = Boolean(body && searchParams.get("step") === "image");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const creatingDraft = useRef(false);

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
    setSearchParams(body ? { body: body.id, step: "image" } : {} , { replace: true });
    setError("");
    setSourceDirty(false);
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
    if (!body || !sourceImage || saving || creatingDraft.current || (inputMode === "DRAW" && sourceDirty)) return;
    creatingDraft.current = true;
    setSaving(true);
    setError("");
    try {
      const draft = await createJarDesignDraft(sourceImage, body.id);
      setSearchParams({ draft: String(draft.draftId) });
    } catch (requestError) {
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      creatingDraft.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#f8f4ef] px-5 py-10 sm:px-6">
      <main className="mx-auto max-w-6xl">
        <Link to="/jars/new" className="text-sm font-bold text-violet-700 hover:text-violet-900">← 만들기 방식 다시 선택</Link>
        <section className="mt-4 rounded-[28px] border border-white bg-gradient-to-br from-[#e7f2ec] via-[#fffdf7] to-[#f8e9dc] p-6 shadow-[0_12px_36px_rgba(42,74,57,0.06)] sm:p-8">
          <span className="inline-flex rounded-full bg-white/80 px-4 py-2 text-xs font-black tracking-wide text-emerald-800">MEMORY JAR · 작은 저금통 공방</span>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">{draftId ? "우리의 그림에 분위기를 더해요" : imageStep ? "이 저금통에 어떤 추억을 담을까요?" : "추억을 담을, 나만의 작은 오브제"}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">30가지 저금통 중 마음에 드는 모양을 고르고, 그 안에 나만의 그림이나 사진을 담아보세요. 원본 그대로도, AI로 꾸며도 좋아요.</p>
          <ol className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-slate-500" aria-label="디자인 제작 순서">{["저금통 고르기", "그림 담기", "AI로 꾸미기 · 선택", "투입구와 배경", "이름 붙이기"].map((label, i) => <li key={label} aria-current={(draftId ? i === 2 : imageStep ? i === 1 : i === 0) ? "step" : undefined} className={(draftId ? i === 2 : imageStep ? i === 1 : i === 0) ? "text-emerald-800" : ""}><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white">{i + 1}</span>{label}</li>)}</ol>
        </section>

        {!draftId && !imageStep && <JarBodyPicker value={body?.id} previewUrl={previewUrl}
          onChange={(id) => { if (getJarBody(id)) setSearchParams({ body: id }, { replace: true }); }}
          onContinue={() => { if (body) setSearchParams({ body: body.id, step: "image" }); }} disabled={saving} />}

        {!draftId && body && (
          <section hidden={!imageStep} className="mt-6 rounded-[28px] border border-white bg-white/80 p-3 shadow-sm sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50/80 px-4 py-3">
              <div><p className="text-xs font-bold text-emerald-700">선택한 저금통</p><p className="mt-1 font-black text-slate-800">{body.name}</p></div>
              <button type="button" disabled={saving} onClick={() => setSearchParams({ body: body.id })} className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-emerald-800 disabled:opacity-50">모양 다시 고르기</button>
            </div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="디자인 원본 입력 방식">
              <button type="button" disabled={saving} role="tab" aria-selected={inputMode === "DRAW"} onClick={() => setInputMode("DRAW")}
                className={`rounded-xl px-4 py-2.5 text-sm font-black ${inputMode === "DRAW" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>직접 그리기</button>
              <button type="button" disabled={saving} role="tab" aria-selected={inputMode === "UPLOAD"} onClick={() => setInputMode("UPLOAD")}
                className={`rounded-xl px-4 py-2.5 text-sm font-black ${inputMode === "UPLOAD" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>이미지 불러오기</button>
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div hidden={inputMode !== "DRAW"} className="min-w-0"><JarDesignCanvas disabled={saving || !imageStep || inputMode !== "DRAW"} onConfirm={setDesignSource} onDirtyChange={setSourceDirty} /></div>
              {inputMode === "UPLOAD" && (
                <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-violet-200 bg-violet-50/40 p-6 text-center hover:border-violet-400">
                  <span className="text-4xl">🖼️</span><span className="mt-3 font-black text-slate-800">외부 이미지 선택</span>
                  <span className="mt-2 text-xs leading-5 text-slate-500">PNG, JPEG, WebP · 최대 10MB<br />애니메이션 이미지는 사용할 수 없어요.</span>
                  <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={handleExternalImageChange} />
                </label>
              )}
              <aside className="h-fit rounded-[22px] border border-violet-100 bg-gradient-to-b from-white to-violet-50/50 p-4 shadow-sm lg:sticky lg:top-24">
                <h2 className="text-sm font-black text-slate-800">저금통에 담긴 모습</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">그림을 수정했다면 ‘이 그림 사용하기’를 다시 눌러 미리보기에 반영해 주세요.</p>
                <div className="mt-3 aspect-square rounded-2xl bg-[#f7f4ee]"><JarDesignImage bodyStyle={body.id} imageUrl={previewUrl} alt="선택한 저금통과 그림 미리보기" showDefaultSlot /></div>
                {!previewUrl && <p className="mt-2 text-center text-xs leading-5 text-slate-500">그림을 확정하거나 이미지를 골라<br />저금통 안을 채워주세요.</p>}
                {sourceDirty && sourceImage && inputMode === "DRAW" && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">그림이 바뀌었어요. ‘이 그림 사용하기’를 눌러 최신 그림을 반영해 주세요.</p>}
                <button type="button" disabled={!sourceImage || saving || (inputMode === "DRAW" && sourceDirty)} onClick={() => void handleCreateDraft()}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "그림을 준비하고 있어요…" : "이 그림으로 다음 단계 →"}</button>
                <p className="mt-3 text-xs leading-5 text-slate-500">다음 단계부터 저금통 모양은 고정돼요. 그 안의 그림은 원본 그대로 쓰거나 AI 스타일로 꾸밀 수 있어요.</p>
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
