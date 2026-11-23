import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useRequestGate } from "../api/useRequestGate";
import JarDesignCanvas from "../features/jarDesign/components/JarDesignCanvas";
import AiCandidateGallery from "../features/jarDesign/components/AiCandidateGallery";
import DesignProgress from "../features/jarDesign/components/DesignProgress";
import JarBodyPicker from "../features/jarDesign/components/JarBodyPicker";
import JarDesignImage from "../features/jarDesign/components/JarDesignImage";
import { getJarBody } from "../features/jarDesign/jarBodies.mjs";
import JarBodyWorkshop from "../features/jarDesign/components/JarBodyWorkshop";
import { earlyDesignId } from "../features/jarDesign/earlyDesignDraftStore.mjs";
import { useEarlyDesignDraft } from "../features/jarDesign/useEarlyDesignDraft";
import { prepareSourceImage, SOURCE_IMAGE_ACCEPT } from "../features/jarDesign/sourceImageFile.mjs";
import {
  createBodyOnlyDesignDraft,
  createJarDesignDraft,
  getJarDesignDraftError,
  selectJarDesign,
} from "../api/jarDesignDraftApi";

/** Canvas 또는 외부 원본으로 Draft를 만들고 AI 후보 보관함으로 이어지는 별도 사전 디자인 화면이다. */
export default function JarDesignNewPage({ userId }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const nextId = useRef(null);
  const serverId = parseDraftId(params.get("draft"));
  const localId = earlyDesignId(params.get("work"));
  useLayoutEffect(() => {
    if (serverId || params.has("work")) return;
    // 새 제작 링크마다 새 작업을 발급한다. 저장 초안은 명시적인 work 주소로만 복구한다.
    if (nextId.current?.key !== location.key) nextId.current = { key: location.key, id: crypto.randomUUID() };
    const id = nextId.current.id;
    setParams(current => { const next = new URLSearchParams(current); next.set("work", id); return next; },
      { replace: true, state: { ...location.state, earlyDesignNewId: id } });
  }, [serverId, localId, location.key]);
  if (!serverId && !localId) return <main className="p-6"><p role="status">{params.has("work") ? "작업 주소가 올바르지 않아요." : "새 작업을 준비하고 있어요."}</p><Link to="/jars/new">만들기 선택으로 돌아가기</Link></main>;
  return <JarDesignEditor key={`${userId}:${serverId ? `server:${serverId}` : localId}`} userId={userId} workId={serverId ? null : localId} allowMissing={location.state?.earlyDesignNewId === localId} />;
}

/** 저장 작업의 로딩이 끝난 뒤 그림판을 열어, 빈 캔버스가 복구한 그림을 덮어쓰지 않게 한다. */
function JarDesignEditor({ userId, workId, allowMissing }) {
  const [searchParams, setRawSearchParams] = useSearchParams();
  const location = useLocation();
  // 같은 주소로 사진 선택 상태만 저장하는 replace는 유효한 제작 요청을 취소하지 않는다.
  const requestGate = useRequestGate(location.pathname + location.search);
  const [inputMode, setInputMode] = useState("DRAW");
  const [sourceImage, setSourceImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [customBody, setCustomBody] = useState(null);
  // URL에서 단계를 읽어 새로고침과 브라우저 뒤로 가기도 같은 선택으로 복원한다. 파일은 메모리에만 둔다.
  const draftId = parseDraftId(searchParams.get("draft"));
  const catalogOpen = searchParams.get("catalog") === "1";
  const requestedCatalogMode = searchParams.get("catalogMode");
  const catalogMode = catalogOpen && ["photo", "body-only"].includes(requestedCatalogMode) ? requestedCatalogMode : null;
  const catalogBodyOnly = catalogMode === "body-only";
  const body = getJarBody(searchParams.get("body"), customBody);
  const imageOnly = searchParams.get("mode") === "image-only";
  const imageStep = Boolean((body || imageOnly) && searchParams.get("step") === "image");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const creatingDraft = useRef(false);
  const sourceSelection = useRef(0);
  const [readingSource, setReadingSource] = useState(false);
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState("");
  const [galleryStep, setGalleryStep] = useState(3);
  const [bodyOnlyDraft, setBodyOnlyDraft] = useState(false);
  const [previewControlsTarget, setPreviewControlsTarget] = useState(null);
  const [initialBodyCanvas, setInitialBodyCanvas] = useState(null);
  const [initialImageCanvas, setInitialImageCanvas] = useState(null);
  const createdServerDraft = useRef(null);
  const early = useEarlyDesignDraft({ userId, id: workId, allowMissing,
    initial: { bodyStyle: body?.id, catalogOpen, catalogMode, imageOnly, step: imageStep ? 2 : 1 },
    onPromoted: id => setRawSearchParams({ draft: String(id) }, { replace: true }),
    onRestore: value => {
      setCustomBody(value.customBody); setSourceImage(value.sourceImage); setInputMode(value.inputMode);
      setSourceDirty(value.sourceDirty);
      setInitialBodyCanvas(value.bodyCanvas); setInitialImageCanvas(value.imageCanvas);
      const next = { work: workId };
      if (value.bodyStyle) next.body = value.bodyStyle;
      if (value.catalogOpen) {
        next.catalog = "1";
        // 방식 선택이 없던 이전 초안은 사진을 담는 기존 경로의 저장 작업이다.
        if (value.catalogMode) next.catalogMode = value.catalogMode;
        else if (value.bodyStyle || value.step === 2) next.catalogMode = "photo";
      }
      if (value.imageOnly) next.mode = "image-only";
      if (value.step === 2) next.step = "image";
      setRawSearchParams(next, { replace: true, state: location.state });
    },
  });
  function setSearchParams(value, options = {}) {
    const next = new URLSearchParams(value);
    if (!next.has("draft") && workId) {
      next.set("work", workId);
      // 준비된 모양의 사진 단계에서도 원래 모양 목록으로 돌아갈 수 있게 한다.
      if (catalogOpen) next.set("catalog", "1");
      if (catalogMode && !next.has("catalogMode")) next.set("catalogMode", catalogMode);
    }
    setRawSearchParams(next, { ...options, state: location.state });
  }

  useEffect(() => {
    if (!draftId && early.ready) early.patch({ bodyStyle: body?.id || null, imageOnly, step: imageStep ? 2 : 1, inputMode, catalogOpen, catalogMode });
  }, [draftId, early.ready, body?.id, imageOnly, imageStep, inputMode, catalogOpen, catalogMode]);
  const previewReady = Boolean(previewUrl && loadedPreviewUrl === previewUrl);
  useLayoutEffect(() => {
    // 같은 화면의 단계 이동도 이전 제작 요청을 끝낸 것으로 취급한다. 늦은 finally가 새 요청을 풀지 않는다.
    creatingDraft.current = false;
    setSaving(false);
    if (!imageStep) setReadingSource(false);
  }, [requestGate, imageStep]);
  const stepKey = draftId ? `draft:${draftId}` : imageStep ? "image" : "body";
  // 같은 경로의 query만 바뀌어도 새 단계의 첫 제목부터 보여준다. 사진 교체·모양 탐색에는 이동하지 않는다.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    return () => cancelAnimationFrame(frame);
  }, [stepKey]);

  useEffect(() => {
    if (!sourceImage) {
      setPreviewUrl("");
      return undefined;
    }
    const nextPreviewUrl = URL.createObjectURL(sourceImage);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [sourceImage]);

  /** 라우터가 화면을 갱신하기 전 주소만 먼저 바뀐 순간에도 이전 응답의 이동을 차단한다. */
  function beginPageRequest(lane) {
    const isLatest = requestGate.begin(lane);
    const startedUrl = window.location.pathname + window.location.search;
    return () => isLatest() && window.location.pathname + window.location.search === startedUrl;
  }

  /** 새 원본을 고르면 이전 Draft로 이어지는 URL을 지워 잘못된 후보를 섞지 않는다. */
  function setDesignSource(imageFile) {
    sourceSelection.current += 1;
    setReadingSource(false);
    setLoadedPreviewUrl("");
    setSourceImage(imageFile);
    early.patch({ sourceImage: imageFile, sourceDirty: false });
    setSearchParams(body ? { body: body.id, step: "image" } : { mode: "image-only", step: "image" } , { replace: true });
    setError("");
    setSourceDirty(false);
  }

  /** 파일 선택은 사용성을 위한 사전 안내이며, 실제 PNG/JPEG/WebP·단일 프레임 검증은 서버가 책임진다. */
  async function handleExternalImageChange(event) {
    const imageFile = event.target.files?.[0];
    event.target.value = "";
    if (!imageFile) return;
    const selection = ++sourceSelection.current;
    const isCurrent = beginPageRequest("source");
    setReadingSource(true);
    setError("");
    try {
      const prepared = await prepareSourceImage(imageFile);
      // 연속 선택·입력 방식 전환 뒤 늦게 끝난 이전 파일이 최신 그림을 덮어쓰지 않는다.
      if (isCurrent() && selection === sourceSelection.current) setDesignSource(prepared);
    } catch (readError) {
      if (isCurrent() && selection === sourceSelection.current) setError(readError.message || "사진을 읽지 못했어요. 다시 선택해 주세요.");
    } finally {
      if (isCurrent() && selection === sourceSelection.current) setReadingSource(false);
    }
  }

  /** Draft가 성공적으로 저장된 뒤에만 URL에 ID를 남겨 새로고침 후에도 후보 보관함을 복원한다. */
  async function handleCreateDraft(bodyOnly = false) {
    if (readingSource || saving || creatingDraft.current) return;
    if (bodyOnly ? !body : ((!body && !imageOnly) || !sourceImage || !previewReady || (inputMode === "DRAW" && sourceDirty))) return;
    creatingDraft.current = true;
    const isCurrent = beginPageRequest("create");
    setSaving(true);
    setError("");
    try {
      const artwork = body?.id === "CUSTOM" ? customBody : undefined;
      const source = bodyOnly ? null : sourceImage;
      const previous = createdServerDraft.current;
      // 업로드 방식이나 선택한 틀이 바뀌었다면 이전 요청의 서버 초안을 재사용하지 않는다.
      const draft = previous && previous.bodyStyle === body?.id && previous.artwork === artwork && previous.source === source
        ? previous.draft
        : await (bodyOnly
          ? createBodyOnlyDesignDraft(body.id, artwork)
          : createJarDesignDraft(source, body?.id, artwork));
      createdServerDraft.current = { draft, bodyStyle: body?.id, artwork, source };
      // 이미 생성된 서버 작업을 다시 만들지 않는다. 전환 실패 시 다음 시도도 같은 번호를 사용한다.
      await early.finish(draft.draftId);
      if (!isCurrent()) return;
      // 본체를 쓸 때 먼저 원본으로 배치 화면을 연다. 배치는 비파괴 메타데이터이며 이후 AI 후보도 선택 가능하다.
      if (body && !bodyOnly) {
        try { await selectJarDesign(draft.draftId, "ORIGINAL"); }
        catch (selectionError) { if (isCurrent()) setError(getJarDesignDraftError(selectionError).message); }
      }
      if (isCurrent()) setSearchParams({ draft: String(draft.draftId) });
    } catch (requestError) {
      if (isCurrent()) setError(getJarDesignDraftError(requestError).message);
    } finally {
      if (isCurrent()) {
        creatingDraft.current = false;
        setSaving(false);
      }
    }
  }

  if (!draftId && !early.ready) return <main className="mx-auto max-w-3xl p-6">
    <p role={early.error ? "alert" : "status"}>{early.error || "저장한 작업을 불러오는 중이에요."}</p>
    <Link to="/jars/new" className="mt-4 inline-flex min-h-11 items-center font-bold text-emerald-800 underline">만들기 선택으로 돌아가기</Link>
  </main>;

  // 입력 탭을 양쪽 입력 화면에서 공유한다. 그림판은 숨기기만 해 탭 전환에도 작성 중인 획을 보존한다.
  const sourceTabs = <div className="studio-basic-section image-source-options"><h2 className="mb-3 text-sm font-black text-slate-800">사진 또는 그림 추가</h2><div className="grid grid-cols-2 gap-2" role="tablist" aria-label="디자인 원본 입력 방식">
    <button type="button" disabled={saving} role="tab" aria-selected={inputMode === "DRAW"} onClick={() => { sourceSelection.current += 1; setReadingSource(false); setInputMode("DRAW"); }} className={`min-h-12 rounded-xl px-2 text-xs font-bold ${inputMode === "DRAW" ? "bg-emerald-700 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>직접 그리기</button>
    <button type="button" disabled={saving} role="tab" aria-selected={inputMode === "UPLOAD"} onClick={() => setInputMode("UPLOAD")} className={`min-h-12 rounded-xl px-2 text-xs font-bold ${inputMode === "UPLOAD" ? "bg-emerald-700 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>이미지 불러오기</button>
  </div><p className="mt-3 text-xs leading-5 text-slate-500">직접 그리거나 사진을 골라주세요. 위치와 크기는 다음 단계에서 맞춰요.</p></div>;
  const studioPage = !draftId && !catalogOpen;
  const catalogSelection = !draftId && !imageStep && catalogOpen;
  const stepIntro = draftId
    ? bodyOnlyDraft
      ? ["이 모양 그대로 마무리해요", "저금통에 어울리는 투입구를 정하고 이름과 열리는 날짜를 골라요."]
      : ["우리의 그림에 분위기를 더해요", "원본을 그대로 쓰거나, 마음에 드는 AI 스타일을 골라보세요."]
    : imageStep
      ? imageOnly
        ? ["어떤 사진이나 그림을 사용할까요?", "사진 한 장을 고르거나 직접 그린 그림을 저금통의 모습으로 사용해요."]
        : ["이 저금통에 어떤 추억을 담을까요?", "직접 그리거나 사진을 골라 저금통을 채워요."]
      : ["우리만의 저금통 틀 만들기", "기본 틀을 고르거나, 닫힌 테두리를 직접 그려보세요."];
  return (
    <div style={{ overflowAnchor: "none" }} className="min-h-[calc(100vh-80px)] bg-[#f3f8f5] px-4 py-7 sm:px-6">
      <main className={studioPage ? "mx-auto max-w-[1440px]" : catalogSelection && !catalogMode ? "mx-auto max-w-5xl" : "mx-auto max-w-6xl"}>
        <Link to="/jars/new" className="text-sm font-bold text-violet-700 hover:text-violet-900">← 만들기 방식 다시 선택</Link>
        {!catalogSelection && <section className={studioPage ? "studio-intro mt-4 py-3" : "mt-4 rounded-[28px] border border-white bg-gradient-to-br from-[#e7f2ec] via-[#fffdf7] to-[#f8e9dc] p-6 shadow-[0_12px_36px_rgba(42,74,57,0.06)] sm:p-8"}>
          <span className="inline-flex rounded-full bg-white/80 px-4 py-2 text-xs font-black tracking-wide text-emerald-800">MEMORY JAR · 작은 저금통 공방</span>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">{stepIntro[0]}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{stepIntro[1]}</p>
          <details className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><summary className="min-h-11 cursor-pointer py-3 font-bold">만들기 도움말</summary><p>다른 방식으로 시작하려면 위에 있는 ‘만들기 방식 다시 선택’을 눌러주세요. AI 변환은 선택 사항이고, 원본으로도 완성할 수 있어요.</p></details>
          <DesignProgress activeStep={draftId ? galleryStep : imageStep ? 2 : 1} bodyOnly={bodyOnlyDraft} />
        </section>}

        {!draftId && (!catalogSelection || early.error) && <div className="mt-4 rounded-xl border border-emerald-100 bg-white px-4 py-3 text-xs text-emerald-900">
          {!catalogSelection && <p role="status">{early.status === "saving" ? "작업을 저장하고 있어요…" : early.status === "saved" ? "이 브라우저에 작업을 저장했어요. 이어서 만들기로 다시 열 수 있어요." : "틀과 그림은 이 브라우저에 계정별로 자동 저장돼요."}</p>}
          {early.error && <p role="alert" className="mt-2 text-rose-700">{early.error} <button type="button" onClick={early.retry} className="min-h-8 underline">다시 저장</button></p>}
        </div>}
        {/* 선택 목록이나 그림 담기로 이동해도 틀 그림판을 유지해 미완성 획과 실행 취소 이력을 보존한다. */}
        {!draftId && <div hidden={imageStep || catalogOpen}><JarBodyWorkshop value={customBody} onChange={value => { setCustomBody(value); early.patch({ customBody: value }); }} initialCanvas={initialBodyCanvas} onSnapshot={value => early.patch({ bodyCanvas: value })} previewUrl={previewUrl} disabled={saving || imageStep || catalogOpen}
          onContinue={() => { if (getJarBody("CUSTOM",customBody)) setSearchParams({body:"CUSTOM",step:"image"}); }}/></div>}
        {catalogSelection && <>
          <div role="group" aria-label="사진 또는 그림 사용 방식" className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-5">
            {[
              { id: "photo", label: "사진·그림 함께 담기", detail: "사진 창이 있는 모양을 고르고 내 사진이나 그림을 담아요." },
              { id: "body-only", label: "저금통 모양만 사용하기", detail: "사진 창 없이 몸통의 색과 무늬가 이어지는 모양을 골라요." },
            ].map(({ id, label, detail }) => (
              <div key={id} data-selected={catalogMode === id || undefined} className={`relative rounded-[24px] border border-emerald-100 bg-white shadow-sm transition-colors hover:border-emerald-500 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700 data-selected:border-emerald-700 data-selected:bg-emerald-50 ${catalogMode ? "flex items-center gap-3 p-2.5 sm:gap-4" : "grid gap-4 p-3 sm:p-4"}`}>
                <div aria-hidden="true" className={`pointer-events-none grid shrink-0 place-items-center rounded-[16px] ${id === "photo" ? "bg-[#f7eee6]" : "bg-[#edf4e8]"} ${catalogMode ? "size-16 sm:size-20" : "h-44 sm:h-56"}`}>
                  <div className={catalogMode ? "size-14 sm:size-16" : "size-40 sm:size-52"}>
                    <JarDesignImage bodyStyle="BEAR" alt="" showDefaultSlot
                      imageUrl={id === "photo" ? "/images/ai-styles/cute-2d.webp" : undefined}
                      fillEmptyBody={id === "body-only"} />
                  </div>
                </div>
                <button type="button" aria-labelledby={`catalog-mode-${id}`} aria-describedby={`catalog-detail-${id}`}
                  aria-pressed={catalogMode === id} disabled={saving} onClick={() => {
                  if (catalogMode === id) return;
                  setError("");
                  setSearchParams({ catalogMode: id, ...(body && { body: body.id }) });
                }} className="absolute inset-0 z-10 w-full cursor-pointer rounded-[24px] focus:outline-none disabled:cursor-default" />
                <div className={`flex min-w-0 flex-1 items-center justify-between gap-2 ${catalogMode ? "pr-2" : "px-2 pb-2"}`}>
                  <span>
                    <span id={`catalog-mode-${id}`} className={`block font-black text-emerald-900 ${catalogMode ? "text-base" : "text-xl sm:text-2xl"}`}>{label}</span>
                    <span id={`catalog-detail-${id}`} className="mt-1 block text-sm leading-6 text-slate-600">{detail}</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-lg font-bold text-emerald-800">{catalogMode === id ? "✓" : "→"}</span>
                </div>
              </div>
            ))}
          </div>
          {catalogMode && <JarBodyPicker value={body?.id} previewUrl={previewUrl} bodyOnly={catalogBodyOnly} saving={saving} error={error}
            onChange={(id) => { if (getJarBody(id)) { setError(""); setSearchParams({ body: id }, { replace: true }); } }}
            onImageOnly={catalogBodyOnly ? undefined : () => setSearchParams({ mode: "image-only", step: "image" })}
            onContinue={() => {
              if (!body) return;
              if (catalogBodyOnly) void handleCreateDraft(true);
              else setSearchParams({ body: body.id, step: "image" });
            }} disabled={saving} />}
        </>}

        {/* 모양을 다시 고르는 동안에도 그림판을 숨겨 유지하여 작성 중인 그림을 잃지 않는다. */}
        {!draftId && (
          <section hidden={!imageStep} className="image-input-studio mt-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50/80 px-4 py-3">
              <div><p className="text-xs font-bold text-emerald-700">선택한 제작 방식</p><p className="mt-1 font-black text-slate-800">{body?.name || "이미지만 사용하기"}</p></div>
              <button type="button" disabled={saving} onClick={() => setSearchParams(body ? { body: body.id } : {})} className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-emerald-800 disabled:opacity-50">모양 다시 고르기</button>
            </div>
            {body && imageStep && !catalogOpen && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3">
                <p className="text-sm text-slate-600">사진 없이 만들면 사진 창 자리까지 저금통의 색과 무늬가 이어져요.</p>
                <button type="button" disabled={saving || readingSource} onClick={() => void handleCreateDraft(true)}
                  className="min-h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 disabled:opacity-50">
                  저금통 모양만 사용할래요 →
                </button>
              </div>
            )}
            <div className="studio-workspace">
              <div hidden={inputMode !== "DRAW"} className="studio-editor min-w-0"><JarDesignCanvas workshopLayout toolboxHeader={sourceTabs} disabled={saving || !imageStep || inputMode !== "DRAW"} onConfirm={setDesignSource} initialCanvas={initialImageCanvas} onSnapshot={value => early.patch({ imageCanvas: value })} onDirtyChange={value => { setSourceDirty(value); early.patch({ sourceDirty: value }); }} /></div>
              {inputMode === "UPLOAD" && (
                <div className="image-upload-studio min-w-0">
                  {sourceTabs}
                  <label className="image-upload-paper relative flex min-h-96 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[18px] border-2 border-dashed border-emerald-200 bg-white p-6 text-center hover:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500">
                    {previewUrl ? <img key={previewUrl} src={previewUrl} alt="선택한 원본 사진" className="max-h-72 w-full rounded-xl object-contain" /> : <span className="text-4xl">🖼️</span>}
                    <span className="mt-3 font-black text-slate-800">{previewUrl ? "다른 사진 선택" : "외부 이미지 선택"}</span>
                    <span className="mt-2 text-xs leading-5 text-slate-500">PNG, JPEG, WebP · 최대 10MB<br />HEIC 사진은 JPEG로 변환해 주세요.</span>
                    {/* 모바일에서도 실제 파일 입력이 선택 영역 전체를 받도록 한다. */}
                    <input aria-label="외부 이미지 선택" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" accept={SOURCE_IMAGE_ACCEPT} disabled={saving} onChange={(event) => void handleExternalImageChange(event)} />
                  </label>
                  <p role="status" className="image-upload-status mt-3 break-words text-xs leading-5 text-emerald-800">{readingSource ? "선택한 사진을 확인하고 있어요…" : sourceImage ? `${sourceImage.name || "선택한 그림"} · ${previewReady ? "사진 준비 완료. 다음 단계로 계속해 주세요." : "미리보기를 확인하고 있어요…"}` : "사진을 고르면 여기에서 바로 확인할 수 있어요."}</p>
                  {error && <p role="alert" className="image-upload-error mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                  <section aria-label="저작권과 AI 변환 안내" className="image-upload-notice mt-5 rounded-2xl border border-stone-200/80 bg-[#faf8f4] p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-emerald-800" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></svg>
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-stone-800">저작권과 AI 변환 안내</h2>
                        <p className="mt-2 text-sm leading-6 text-stone-600">유명한 만화나 게임 캐릭터 이미지는 AI 제공자 정책에 따라 변환이 제한될 수 있어요.</p>
                        <p className="mt-2 text-xs leading-5 text-stone-500">직접 찍은 사진이나 직접 그린 그림 등 사용 권한이 있는 이미지를 준비해 주세요. AI 변환은 선택 사항이에요.</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
              <aside className="studio-preview h-fit rounded-[18px] border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black text-slate-800">저금통에 담긴 모습</h2><div ref={setPreviewControlsTarget} data-studio-preview-controls /></div>
                <p className="mt-2 text-xs leading-5 text-slate-500">그림을 수정했다면 ‘이 그림 사용하기’를 다시 눌러 미리보기에 반영해 주세요.</p>
                <div className="studio-preview-stage mt-3 aspect-square rounded-2xl bg-[#f3f7f5]">{(body || previewUrl) && <JarDesignImage key={previewUrl} bodyStyle={body?.id} customBody={customBody} imageUrl={previewUrl} alt="선택한 저금통과 그림 미리보기" allow3D viewControlsTarget={previewControlsTarget} viewDisabled={readingSource || saving}
                  onImageLoad={() => setLoadedPreviewUrl(previewUrl)} onImageError={() => { setLoadedPreviewUrl(""); setError("이 사진의 미리보기를 읽지 못했어요. JPEG 또는 PNG로 다시 저장한 사진을 선택해 주세요."); }} />}</div>
                {!previewUrl && <p className="mt-2 text-center text-xs leading-5 text-slate-500">그림을 확정하거나 이미지를 골라<br />저금통 안을 채워주세요.</p>}
                {imageOnly && previewUrl && <p className="mt-2 text-xs leading-5 text-slate-500">3D는 이미지 윤곽에 두께를 더해 돌려보는 미리보기예요. 사진 속 대상을 입체 모델로 바꾸지는 않아요.</p>}
                {sourceDirty && sourceImage && inputMode === "DRAW" && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">그림이 바뀌었어요. ‘이 그림 사용하기’를 눌러 최신 그림을 반영해 주세요.</p>}
                <button type="button" disabled={!sourceImage || !previewReady || readingSource || saving || (inputMode === "DRAW" && sourceDirty)} onClick={() => void handleCreateDraft()}
                  className="mt-4 min-h-12 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "그림을 준비하고 있어요…" : "이 그림으로 다음 단계 →"}</button>
                <p className="mt-3 text-xs leading-5 text-slate-500">{body ? "다음 화면에서 사진을 빈틈없이 채우고 위치·확대를 조절해요. 모양을 바꾸거나 이미지만 쓰는 방식으로 돌아갈 수 있어요." : "다음 화면에서 원본 또는 AI 후보를 고른 뒤 기존 이미지 자르기·배경 지우기를 이용해요."}</p>
              </aside>
            </div>
          </section>
        )}

        {error && !(imageStep && inputMode === "UPLOAD") && !(catalogOpen && !imageStep && catalogMode) && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}
        {draftId && <AiCandidateGallery key={`${userId}:${draftId}`} userId={userId} draftId={draftId}
          onStepChange={setGalleryStep} onBodyOnlyChange={setBodyOnlyDraft} />}
      </main>
    </div>
  );
}

function parseDraftId(value) {
  const draftId = Number(value);
  return Number.isSafeInteger(draftId) && draftId > 0 ? draftId : null;
}
