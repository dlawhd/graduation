import { useLayoutEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  finalizeJarDesignDraft,
  getJarDesignDraftError,
  getJarDesignGenerationPreview,
  getJarDesignOriginalPreview,
} from "../../../api/jarDesignDraftApi";
import { storedSlot } from "../slotGeometry.mjs";
import JarSlotOverlay from "./JarSlotOverlay";

const INITIAL_JAR_FORM = {
  name: "",
  description: "",
  theme: "SPRING",
  maxMembers: 2,
  openAt: "",
  openMode: "ALL_AT_ONCE",
  lockLevel: "TITLE_ONLY",
};

const THEME_LABELS = {
  SPRING: "봄",
  SUMMER: "여름",
  AUTUMN: "가을",
  WINTER: "겨울",
  LAVENDER: "라벤더",
  DEW: "이슬",
  SAND: "모래",
  MOONLIGHT: "달빛",
};

/**
 * 선택한 디자인·저장된 Slot과 Jar 정보를 한 화면에서 확인한 뒤 Draft를 실제 Jar로 확정한다.
 * 이미 구현된 Finalize API만 호출하며, 기본 Jar 생성 화면이나 Draft 밖의 Jar를 수정하지 않는다.
 */
export default function JarDesignFinalizePanel({
  draft,
  previewUrl,
  slotDirty,
  slotSaving,
  disabled,
  onRefresh,
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_JAR_FORM);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [retryUrl, setRetryUrl] = useState("");
  const [previewState, setPreviewState] = useState(previewUrl ? "loading" : "missing");
  const [retryingPreview, setRetryingPreview] = useState(false);
  const isCustom = draft.selectedDesignType === "ORIGINAL" || draft.selectedDesignType === "AI";
  const slot = storedSlot(draft);
  const hasProcessing = (draft.generations || []).some((generation) => generation.status === "PROCESSING");
  const imageUrl = retryUrl || previewUrl || "";
  const previewReady = !isCustom || (Boolean(imageUrl) && previewState === "ready");
  const blockedReason = getBlockedReason({ isCustom, slot, slotDirty, slotSaving, hasProcessing, previewReady });
  const formLocked = Boolean(disabled || finalizing);
  const submitLocked = Boolean(disabled || finalizing || blockedReason);

  // 일반 Effect는 이미지가 캐시에서 먼저 로드된 뒤 실행될 수 있다.
  // 레이아웃 반영 직후에 상태를 초기화해, onLoad가 ready 상태를 다시 덮어쓰지 않게 한다.
  useLayoutEffect(() => {
    setRetryUrl("");
    setPreviewState(isCustom && previewUrl ? "loading" : isCustom ? "missing" : "ready");
  }, [draft.selectedDesignType, draft.selectedGenerationId, previewUrl, isCustom]);

  /** Presigned URL이 만료됐을 때만 OWNER 전용 미리보기 URL을 새로 발급한다. */
  async function retryPreview() {
    if (!isCustom || retryingPreview) return;
    setRetryingPreview(true);
    setError("");
    try {
      const preview = draft.selectedDesignType === "ORIGINAL"
        ? await getJarDesignOriginalPreview(draft.draftId)
        : await getJarDesignGenerationPreview(draft.draftId, draft.selectedGenerationId);
      setPreviewState("loading");
      setRetryUrl(preview.previewUrl);
    } catch (requestError) {
      setPreviewState("failed");
      setError(getJarDesignDraftError(requestError).message);
    } finally {
      setRetryingPreview(false);
    }
  }

  /** HTML 기본 검증 외에도 서버 DTO 범위와 같은 핵심 값을 먼저 안내한다. */
  function validateForm() {
    if (!form.name.trim()) return "저금통 이름을 입력해 주세요.";
    if (form.name.trim().length > 40) return "저금통 이름은 40자 이하여야 해요.";
    if (form.description.length > 200) return "설명은 200자 이하여야 해요.";
    if (!Number.isInteger(Number(form.maxMembers)) || Number(form.maxMembers) < 2 || Number(form.maxMembers) > 50) {
      return "최대 인원은 2명에서 50명 사이로 정해 주세요.";
    }
    if (!form.openAt) return "저금통을 열 날짜와 시간을 정해 주세요.";
    return "";
  }

  /** 한 번의 Finalize 요청만 보내고, 성공한 Jar 상세 화면으로 이동한다. */
  async function handleSubmit(event) {
    event.preventDefault();
    if (submitLocked) return;
    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setFinalizing(true);
    setError("");
    try {
      const result = await finalizeJarDesignDraft(draft.draftId, {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        maxMembers: Number(form.maxMembers),
      });
      navigate(`/jars/${result.jarId}`, { replace: true });
    } catch (requestError) {
      const failure = getJarDesignDraftError(requestError);
      if (["FINALIZE_TARGET_CHANGED", "DRAFT_SLOT_TARGET_CHANGED", "DRAFT_ALREADY_FINALIZED"].includes(failure.code)) {
        onRefresh?.();
      }
      setError(toFinalizeMessage(failure));
    } finally {
      setFinalizing(false);
    }
  }

  if (draft.status === "FINALIZED") {
    return (
      <section className="mt-8 rounded-[24px] border border-emerald-200 bg-emerald-50 p-6" aria-label="최종화 완료">
        <h3 className="text-lg font-black text-emerald-900">이미 저금통을 만들었어요</h3>
        <p className="mt-2 text-sm text-emerald-800">같은 Draft로 새 저금통을 중복 생성하지 않습니다.</p>
        {draft.finalizedJarId && <Link to={`/jars/${draft.finalizedJarId}`} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 text-sm font-black text-white">만든 저금통 보기</Link>}
      </section>
    );
  }

  return (
    <section className="mt-8 border-t border-violet-100 pt-8" aria-label="최종 미리보기와 저금통 만들기">
      <div>
        <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700">마지막 단계</div>
        <h3 className="mt-3 text-2xl font-black text-slate-800">완성 모습을 확인하고 저금통을 만들어요</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">확정하면 디자인과 투입구는 더 이상 바꿀 수 없어요. 대신 기존 기본 저금통 생성 규칙은 그대로 적용돼요.</p>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-700">최종 디자인</p>
          <div className="relative mt-3 aspect-square overflow-hidden rounded-2xl bg-white">
            {isCustom && imageUrl && (
              <img src={imageUrl} alt="최종 저금통 디자인 미리보기" className="h-full w-full object-contain"
                onLoad={(event) => setPreviewState(event.currentTarget.naturalWidth === event.currentTarget.naturalHeight ? "ready" : "failed")}
                onError={() => setPreviewState("failed")} />
            )}
            {isCustom && previewState === "ready" && slot && <JarSlotOverlay slot={slot} />}
            {isCustom && previewState !== "ready" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-sm font-semibold leading-6 text-slate-500">
                {previewState === "loading" ? "최종 이미지를 불러오는 중이에요." : "최종 이미지를 불러오지 못했어요."}
              </div>
            )}
            {!isCustom && (
              <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-violet-100 via-white to-pink-100 p-8 text-center">
                <span className="text-5xl" aria-hidden="true">🫙</span>
                <p className="mt-4 text-lg font-black text-slate-800">기본 {THEME_LABELS[form.theme]} 저금통</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">커스텀 이미지 없이 기존 테마 저금통으로 만들어요.</p>
              </div>
            )}
          </div>
          {isCustom && <button type="button" onClick={() => void retryPreview()} disabled={retryingPreview || formLocked}
            className="mt-3 min-h-11 text-sm font-bold text-violet-700 disabled:opacity-50">{retryingPreview ? "이미지 불러오는 중..." : "이미지 다시 불러오기"}</button>}
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {draft.selectedDesignType === "AI" ? "선택한 AI 후보와 저장한 투입구 위치" : draft.selectedDesignType === "ORIGINAL" ? "정규화한 원본과 저장한 투입구 위치" : "기존 기본 Jar 생성 방식"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-700 sm:col-span-2">저금통 이름
              <input name="name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                maxLength="40" required disabled={formLocked} placeholder="예: 우리의 2026 추억 저금통"
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-violet-400 disabled:bg-slate-50" />
            </label>
            <label className="block text-sm font-bold text-slate-700 sm:col-span-2">설명
              <textarea name="description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                maxLength="200" rows="3" disabled={formLocked} placeholder="함께 담을 추억을 짧게 적어 주세요."
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-slate-800 outline-none focus:border-violet-400 disabled:bg-slate-50" />
            </label>
            <label className="block text-sm font-bold text-slate-700">테마
              <select value={form.theme} onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))} disabled={formLocked}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-800 disabled:bg-slate-50">
                {Object.entries(THEME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700">최대 인원
              <input type="number" min="2" max="50" value={form.maxMembers} onChange={(event) => setForm((current) => ({ ...current, maxMembers: event.target.value }))}
                required disabled={formLocked} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-violet-400 disabled:bg-slate-50" />
            </label>
            <label className="block text-sm font-bold text-slate-700 sm:col-span-2">오픈 날짜와 시간
              <input type="datetime-local" value={form.openAt} onChange={(event) => setForm((current) => ({ ...current, openAt: event.target.value }))}
                required disabled={formLocked} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 text-slate-800 outline-none focus:border-violet-400 disabled:bg-slate-50" />
            </label>
            <label className="block text-sm font-bold text-slate-700">오픈 방식
              <select value={form.openMode} onChange={(event) => setForm((current) => ({ ...current, openMode: event.target.value }))} disabled={formLocked}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-800 disabled:bg-slate-50">
                <option value="ALL_AT_ONCE">한 번에 열기</option>
                <option value="DAILY_DRAW">하루에 하나씩 열기</option>
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700">잠금 공개 범위
              <select value={form.lockLevel} onChange={(event) => setForm((current) => ({ ...current, lockLevel: event.target.value }))} disabled={formLocked}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-800 disabled:bg-slate-50">
                <option value="HIDDEN">완전히 숨김</option>
                <option value="META_ONLY">기본 정보만 공개</option>
                <option value="TITLE_ONLY">제목만 공개</option>
              </select>
            </label>
          </div>
          {blockedReason && <p role="status" className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{blockedReason}</p>}
          {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
          <button type="submit" disabled={submitLocked}
            className="mt-6 min-h-12 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
            {finalizing ? "저금통을 확정하는 중..." : "이 디자인으로 저금통 만들기"}
          </button>
        </form>
      </div>
    </section>
  );
}

/** Finalize를 막는 이유를 API 호출 전에 구체적으로 안내한다. 서버도 같은 규칙을 최종 검증한다. */
function getBlockedReason({ isCustom, slot, slotDirty, slotSaving, hasProcessing, previewReady }) {
  if (hasProcessing) return "AI 후보를 만드는 중에는 최종화할 수 없어요. 생성이 끝난 뒤 다시 시도해 주세요.";
  if (slotSaving) return "투입구 위치를 저장하는 중이에요. 저장이 끝난 뒤 최종화할 수 있어요.";
  if (slotDirty) return "투입구 편집 내용을 먼저 저장해 주세요.";
  if (isCustom && !slot) return "커스텀 디자인은 투입구 위치와 크기를 먼저 저장해야 해요.";
  if (!previewReady) return "최종 이미지를 확인한 뒤 저금통을 만들 수 있어요.";
  return "";
}

function toFinalizeMessage(failure) {
  if (failure.code === "DRAFT_SLOT_REQUIRED") return "투입구 위치와 크기를 먼저 저장해 주세요.";
  if (failure.code === "DRAFT_PROCESSING_FINALIZE_BLOCKED") return "AI 후보 생성이 끝난 뒤 다시 시도해 주세요.";
  if (failure.code === "FINALIZE_TARGET_CHANGED" || failure.code === "DRAFT_SLOT_TARGET_CHANGED") return "다른 화면에서 디자인이 바뀌었어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.";
  if (failure.code === "DRAFT_ALREADY_FINALIZED") return "이미 이 Draft로 저금통을 만들었어요. 새로고침해 결과를 확인해 주세요.";
  return failure.message;
}
