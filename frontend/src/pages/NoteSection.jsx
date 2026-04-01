// src/pages/NoteSection.jsx

import { useEffect, useMemo, useState } from "react";
import noteApi from "../api/noteApi";

// 잠금 레벨을 화면용으로 바꿔주는 작은 사전
const LOCK_LEVEL_LABEL = {
  HIDDEN: "완전 비밀",
  META_ONLY: "메타만 공개",
  TITLE_ONLY: "제목만 공개",
};

// 입력값이 문자열이면 앞뒤 공백을 정리해줘.
function toSafeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// note id를 안전하게 꺼내기
function getNoteId(note) {
  return note?.noteId ?? note?.id ?? note?.note_id ?? null;
}

// 태그가 배열일 수도 있고, 문자열일 수도 있으니 모두 처리해줘.
function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => toSafeText(tag)).filter(Boolean);
  }

  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => toSafeText(tag))
      .filter(Boolean);
  }

  return [];
}

// 목록 응답이 paging 형태여도 되고, 그냥 배열이어도 되게 맞춰줘.
function normalizeListPayload(payload) {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      page: 0,
      size: payload.length || 6,
      totalElements: payload.length,
      totalPages: 1,
    };
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];

  return {
    items,
    page: Number(payload?.page ?? 0),
    size: Number(payload?.size ?? (items.length || 6)),
    totalElements: Number(payload?.totalElements ?? items.length),
    totalPages: Math.max(1, Number(payload?.totalPages ?? 1)),
  };
}

// 날짜만 예쁘게 보여주기
function formatDateOnly(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// 현재 저금통 상태에 따라 note 안내 문구 만들기
function getLockGuide(jar) {
  if (!jar) {
    return {
      chip: "확인 중",
      title: "쪽지 상태를 확인하고 있어요.",
      description: "잠시만 기다려 주세요.",
      chipClass: "bg-slate-100 text-slate-600",
    };
  }

  if (jar.isOpen) {
    return {
      chip: "OPEN",
      title: "지금은 쪽지 내용을 바로 볼 수 있어요.",
      description: "저금통이 열린 상태라서 목록과 상세에서 추억 내용을 확인할 수 있어요.",
      chipClass: "bg-emerald-100 text-emerald-700",
    };
  }

  if (jar.lockLevel === "HIDDEN") {
    return {
      chip: LOCK_LEVEL_LABEL.HIDDEN,
      title: "오픈 전에는 아주 조금만 보여요.",
      description: "완전 비밀 상태라서 아직은 개수와 기본 흐름만 느낄 수 있어요.",
      chipClass: "bg-amber-100 text-amber-700",
    };
  }

  if (jar.lockLevel === "META_ONLY") {
    return {
      chip: LOCK_LEVEL_LABEL.META_ONLY,
      title: "오픈 전에는 메타 정보만 보여요.",
      description: "날짜, 장소, 태그 같은 힌트만 보고 자세한 내용은 오픈 뒤에 확인할 수 있어요.",
      chipClass: "bg-amber-100 text-amber-700",
    };
  }

  return {
    chip: LOCK_LEVEL_LABEL.TITLE_ONLY,
    title: "오픈 전에는 제목만 살짝 보여요.",
    description: "제목은 볼 수 있지만 내용은 아직 잠겨 있어요.",
    chipClass: "bg-amber-100 text-amber-700",
  };
}

// 카드에서 제목을 어떻게 보여줄지 정하기
function getVisibleTitle(note, jar) {
  const title = toSafeText(note?.title);

  if (jar?.isOpen) {
    return title || "제목 없는 추억";
  }

  if (jar?.lockLevel === "TITLE_ONLY") {
    return title || "제목 없는 추억";
  }

  return "잠겨 있는 추억";
}

// 카드에서 짧은 설명 보여주기
function getCardSummary(note, jar) {
  const content = toSafeText(note?.content);

  if (jar?.isOpen && content) {
    if (content.length <= 72) return content;
    return `${content.slice(0, 72)}...`;
  }

  if (jar?.lockLevel === "TITLE_ONLY") {
    return "오픈 전이라 내용은 아직 비밀이에요.";
  }

  if (jar?.lockLevel === "META_ONLY") {
    return "오픈 전이라 날짜, 장소, 태그 같은 정보만 보여줘요.";
  }

  return "오픈 전이라 아직 내용은 볼 수 없어요.";
}

// 작성 요청용 payload 만들기
function buildCreatePayload(form) {
  const title = toSafeText(form.title);
  const content = toSafeText(form.content);
  const location = toSafeText(form.location);
  const tags = normalizeTags(form.tagsText);

  const payload = {
    title,
    content,
  };

  if (form.noteDate) payload.noteDate = form.noteDate;
  if (location) payload.location = location;
  if (tags.length > 0) payload.tags = tags;

  return payload;
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function PaperComposeModal({
  open,
  phase,
  step,
  form,
  setForm,
  palette,
  loading,
  onClose,
  onShowPreview,
  onShowConfirm,
  onBackToForm,
  onBackToPreview,
  onSubmit,
}) {
  if (!open) return null;

  const tags = normalizeTags(form.tagsText);

  const isFormStep = step === "form";
  const isPreviewStep = step === "preview";
  const isConfirmStep = step === "confirm";

  const isClosing = phase === "closing" || phase === "submitting";

  const paperAnimationClass =
    phase === "opening"
      ? "paper-unfold"
      : isClosing
      ? "paper-fold-away"
      : "paper-idle";

  const contentAnimationClass = isClosing
    ? "paper-content-hide"
    : "paper-content-show";

  const disableClose = loading || phase === "submitting";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
      {/* 어두운 배경 */}
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px] paper-overlay-open" />

      {/* 종이 본체 */}
      <div className={`relative w-full max-w-2xl origin-center ${paperAnimationClass}`}>
        <div className="relative overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(180deg,#fffdf8_0%,#fff8ef_100%)] px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
          {/* 접힌 모서리 */}
          <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-[28px] border-b border-l border-white/80 bg-white/80" />

          {/* 꾸깃한 종이 느낌 장식 */}
          <div className="pointer-events-none absolute left-8 top-10 h-20 w-[2px] rotate-[10deg] bg-slate-200/60" />
          <div className="pointer-events-none absolute right-16 top-16 h-24 w-[2px] -rotate-[14deg] bg-slate-200/50" />
          <div className="pointer-events-none absolute left-20 bottom-14 h-16 w-[2px] rotate-[18deg] bg-slate-200/50" />
          <div className="pointer-events-none absolute left-6 top-6 h-24 w-10 rounded-full bg-white/45 blur-md" />

          <div className={`relative z-10 ${contentAnimationClass}`}>
            {/* 헤더 */}
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-black text-slate-800">
                  {isFormStep && "새 쪽지 넣기"}
                  {isPreviewStep && "쪽지 미리보기"}
                  {isConfirmStep && "정말 넣을까요?"}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {isFormStep &&
                    "종이가 펴졌어요. 차근차근 적고, 미리보기까지 확인한 뒤 넣으면 돼요."}
                  {isPreviewStep &&
                    "실제로 들어갈 모양을 보고 마지막으로 한 번 더 확인해 보자."}
                  {isConfirmStep &&
                    "넣는 순간 종이가 다시 접히면서 저금통 안으로 들어가요."}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={disableClose}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                닫기
              </button>
            </div>

            {/* 1단계: 작성 */}
            {isFormStep && (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">
                    제목 (필수)
                  </span>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="예: 우리 첫 여행"
                    required
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">
                    내용 (필수)
                  </span>
                  <textarea
                    rows="7"
                    value={form.content}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, content: e.target.value }))
                    }
                    placeholder="남기고 싶은 추억을 자유롭게 적어 주세요."
                    required
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-500">
                      추억 날짜 (선택)
                    </span>
                    <input
                      type="date"
                      value={form.noteDate}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          noteDate: e.target.value,
                        }))
                      }
                      className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-500">
                      장소 (선택)
                    </span>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          location: e.target.value,
                        }))
                      }
                      placeholder="예: 서울숲"
                      className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">
                    태그 (선택)
                  </span>
                  <input
                    type="text"
                    value={form.tagsText}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        tagsText: e.target.value,
                      }))
                    }
                    placeholder="예: 여행, 봄, 웃음"
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  />
                  <p className="mt-2 text-xs text-slate-400">
                    쉼표(,)로 구분해서 여러 개를 넣을 수 있어요.
                  </p>
                </label>

                <div className="flex flex-wrap justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${palette.outlineBtn}`}
                  >
                    취소
                  </button>

                  <button
                    type="button"
                    onClick={onShowPreview}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] ${palette.primaryButton}`}
                  >
                    미리보기 보기
                  </button>
                </div>
              </div>
            )}

            {/* 2단계: 미리보기 */}
            {isPreviewStep && (
              <div>
                <div className={`rounded-[28px] border p-5 ${palette.panel}`}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                      제출 전 미리보기
                    </span>

                    {form.noteDate && (
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                        {formatDateOnly(form.noteDate)}
                      </span>
                    )}

                    {toSafeText(form.location) && (
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                        {form.location}
                      </span>
                    )}
                  </div>

                  <h3 className="mb-3 text-xl font-black text-slate-800">
                    {toSafeText(form.title) || "제목 없는 추억"}
                  </h3>

                  <div className={`rounded-2xl border px-4 py-4 text-sm leading-7 text-slate-700 ${palette.infoBox}`}>
                    {toSafeText(form.content) || "내용이 비어 있어요."}
                  </div>

                  {tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${palette.outlineButton}`}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={onBackToForm}
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${palette.outlineBtn}`}
                  >
                    다시 수정하기
                  </button>

                  <button
                    type="button"
                    onClick={onShowConfirm}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] ${palette.primaryButton}`}
                  >
                    제출 확인으로
                  </button>
                </div>
              </div>
            )}

            {/* 3단계: 최종 확인 */}
            {isConfirmStep && (
              <div className="py-4 text-center">
                <div className="mb-4 text-5xl">📮</div>

                <h3 className="mb-2 text-xl font-black text-slate-800">
                  이 쪽지를 정말 넣을까요?
                </h3>

                <p className="text-sm leading-7 text-slate-500">
                  누르면 종이가 다시 접히면서 저금통 안으로 들어가요.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={onBackToPreview}
                    disabled={loading}
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${palette.outlineBtn}`}
                  >
                    다시 보기
                  </button>

                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={loading}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
                  >
                    {loading ? "저금통에 넣는 중..." : "정말 넣기"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteDetailModal({
  open,
  note,
  loading,
  error,
  jar,
  palette,
  formatDate,
  onClose,
  onRetry,
}) {
  if (!open) return null;

  const tags = normalizeTags(note?.tags);
  const hasContent = toSafeText(note?.content).length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/55 px-4 py-6">
      <div className="w-full max-w-3xl rounded-[32px] border border-white/70 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-black text-slate-800">쪽지 상세 보기</p>
            <p className="mt-1 text-sm text-slate-500">
              저금통 상태에 맞는 정보만 보여줘요.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
          >
           닫기
          </button>
        </div>

        {loading && (
          <div className="space-y-3">
            <div className="h-6 w-48 animate-pulse rounded-full bg-slate-200" />
            <div className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-20 animate-pulse rounded-[24px] bg-slate-100" />
              <div className="h-20 animate-pulse rounded-[24px] bg-slate-100" />
            </div>
          </div>
        )}

        {!loading && error && (
          <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
            <p>{error}</p>

            <button
              type="button"
              onClick={onRetry}
              className={`mt-4 rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
            >
              다시 불러오기
            </button>
          </div>
        )}

        {!loading && !error && note && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  jar?.isOpen
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {jar?.isOpen ? "내용 확인 가능" : LOCK_LEVEL_LABEL[jar?.lockLevel] || "잠금 중"}
              </span>

              {note.noteDate && (
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                  {formatDateOnly(note.noteDate)}
                </span>
              )}

              {toSafeText(note.location) && (
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                  {note.location}
                </span>
              )}
            </div>

            <div>
              <h3 className="text-2xl font-black text-slate-800">
                {toSafeText(note.title) || "제목 없는 추억"}
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                작성 시간: {formatDate(note.createdAt)}
              </p>
            </div>

            <div className={`rounded-[28px] border p-5 ${palette.panel}`}>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                내용
              </p>

              <div className={`rounded-2xl border px-4 py-4 text-sm leading-7 text-slate-700 ${palette.infoBox}`}>
                {hasContent
                  ? note.content
                  : "오픈 전이라 내용이 잠겨 있거나, 아직 공개되지 않은 정보예요."}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className={`rounded-2xl border px-4 py-4 ${palette.infoBox}`}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  추억 날짜
                </p>
                <p className="text-sm font-semibold text-slate-700">
                  {formatDateOnly(note.noteDate)}
                </p>
              </div>

              <div className={`rounded-2xl border px-4 py-4 ${palette.infoBox}`}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  장소
                </p>
                <p className="text-sm font-semibold text-slate-700">
                  {toSafeText(note.location) || "-"}
                </p>
              </div>
            </div>

            {tags.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  태그
                </p>

                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className={`rounded-full px-3 py-1 text-xs font-bold ${palette.outlineButton}`}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NoteSection({ jar, palette, formatDate }) {
  const initialQuery = useMemo(
    () => ({
      q: "",
      tag: "",
      page: 0,
      size: 6,
    }),
    []
  );

  const [listData, setListData] = useState({
    items: [],
    page: 0,
    size: 6,
    totalElements: 0,
    totalPages: 1,
  });

  const [query, setQuery] = useState(initialQuery);
  const [searchForm, setSearchForm] = useState({
    q: "",
    tag: "",
  });

  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailNoteId, setDetailNoteId] = useState(null);
  const [detailNote, setDetailNote] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

const [paperVisible, setPaperVisible] = useState(false);
const [composerPhase, setComposerPhase] = useState("closed");
const [composerStep, setComposerStep] = useState("form");
const [createLoading, setCreateLoading] = useState(false);
const [justCreatedNoteId, setJustCreatedNoteId] = useState(null);


  const [writeForm, setWriteForm] = useState({
    title: "",
    content: "",
    noteDate: "",
    location: "",
    tagsText: "",
  });

  const lockGuide = useMemo(() => getLockGuide(jar), [jar]);

  async function loadNotes(nextQuery = query) {
    if (!jar?.jarId) return;

    setNotesLoading(true);
    setNotesError("");

    try {
      const data = await noteApi.getNotes(jar.jarId, nextQuery);
      setListData(normalizeListPayload(data));
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "쪽지 목록을 불러오지 못했어요.";

      setNotesError(serverMessage);
      setListData({
        items: [],
        page: 0,
        size: nextQuery.size || 6,
        totalElements: 0,
        totalPages: 1,
      });
    } finally {
      setNotesLoading(false);
    }
  }

  async function openDetail(noteId) {
    if (!noteId) return;

    setDetailOpen(true);
    setDetailNoteId(noteId);
    setDetailLoading(true);
    setDetailError("");
    setDetailNote(null);

    try {
      const data = await noteApi.getNoteDetail(jar.jarId, noteId);
      setDetailNote(data || null);
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "쪽지 상세를 불러오지 못했어요.";

      setDetailError(serverMessage);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetailNoteId(null);
    setDetailNote(null);
    setDetailError("");
    setDetailLoading(false);
  }

  function resetWriteForm() {
    setWriteForm({
      title: "",
      content: "",
      noteDate: "",
      location: "",
      tagsText: "",
    });
  }

function openComposer() {
  setComposerStep("form");
  setPaperVisible(true);
  setComposerPhase("opening");
}

async function closeComposer() {
  if (createLoading || composerPhase === "submitting") return;

  setComposerPhase("closing");
  await wait(480);

  setPaperVisible(false);
  setComposerPhase("closed");
  setComposerStep("form");
}

function handleOpenPreview() {
  const payload = buildCreatePayload(writeForm);

  if (!payload.title) {
    window.alert("쪽지 제목은 꼭 입력해 주세요.");
    return;
  }

  if (!payload.content) {
    window.alert("쪽지 내용은 꼭 입력해 주세요.");
    return;
  }

  setComposerStep("preview");
}

function handleOpenConfirm() {
  setComposerStep("confirm");
}

function handleBackToForm() {
  setComposerStep("form");
}

function handleBackToPreview() {
  setComposerStep("preview");
}

async function handleCreateNote() {
  const payload = buildCreatePayload(writeForm);

  if (!payload.title) {
    window.alert("쪽지 제목은 꼭 입력해 주세요.");
    return;
  }

  if (!payload.content) {
    window.alert("쪽지 내용은 꼭 입력해 주세요.");
    return;
  }

  setCreateLoading(true);
  setComposerPhase("submitting");

  try {
    const createPromise = noteApi.createNote(jar.jarId, payload);

    await wait(650);

    const createdNote = await createPromise;
    const createdNoteId = getNoteId(createdNote);

    const resetQuery = {
      q: "",
      tag: "",
      page: 0,
      size: query.size || 6,
    };

    setSearchForm({ q: "", tag: "" });
    setQuery(resetQuery);

    await loadNotes(resetQuery);

    if (createdNoteId) {
      setJustCreatedNoteId(createdNoteId);
    }

    setPaperVisible(false);
    setComposerPhase("closed");
    setComposerStep("form");

    resetWriteForm();

    window.alert("쪽지를 저금통에 넣었어요.");
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "쪽지 작성에 실패했어요.";

    setComposerPhase("ready");
    setComposerStep("confirm");

    window.alert(serverMessage);
  } finally {
    setCreateLoading(false);
  }
}

  function handleSearchSubmit(e) {
    e.preventDefault();

    const nextQuery = {
      ...query,
      q: toSafeText(searchForm.q),
      tag: toSafeText(searchForm.tag),
      page: 0,
    };

    setQuery(nextQuery);
    loadNotes(nextQuery);
  }

  function handleResetSearch() {
    const nextQuery = {
      ...query,
      q: "",
      tag: "",
      page: 0,
    };

    setSearchForm({ q: "", tag: "" });
    setQuery(nextQuery);
    loadNotes(nextQuery);
  }

  function handleMovePage(nextPage) {
    const nextQuery = {
      ...query,
      page: nextPage,
    };

    setQuery(nextQuery);
    loadNotes(nextQuery);
  }

  useEffect(() => {
    if (!jar?.jarId) return;

    setQuery(initialQuery);
    setSearchForm({ q: "", tag: "" });
    loadNotes(initialQuery);
  }, [jar?.jarId, initialQuery]);

  // 방금 만들어진 카드만 1.4초 동안 “새 카드” 취급하고 그 뒤에는 평범한 카드로 돌아가게 해줌
  useEffect(() => {
    if (!justCreatedNoteId) return;

    const timer = window.setTimeout(() => {
      setJustCreatedNoteId(null);
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [justCreatedNoteId]);

  useEffect(() => {
    if (!paperVisible || composerPhase !== "opening") return;

    const timer = window.setTimeout(() => {
      setComposerPhase("ready");
    }, 520);

    return () => window.clearTimeout(timer);
  }, [paperVisible, composerPhase]);

  const previewTags = useMemo(
    () => normalizeTags(writeForm.tagsText),
    [writeForm.tagsText]
  );

  return (
    <>
      <style>
        {`
          @keyframes noteCardEnter {
            0% {
              opacity: 0;
              transform: translateY(-22px) scale(0.88) rotate(-6deg);
            }
            55% {
              opacity: 1;
              transform: translateY(6px) scale(1.03) rotate(2deg);
            }
            75% {
              transform: translateY(-2px) scale(0.99) rotate(-1deg);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1) rotate(0deg);
            }
          }

          @keyframes noteCornerEnter {
            0% {
              opacity: 0;
              transform: translate(8px, -8px) scale(0.55) rotate(12deg);
            }
            60% {
              opacity: 1;
              transform: translate(0, 0) scale(1.06) rotate(-2deg);
            }
            100% {
              opacity: 1;
              transform: translate(0, 0) scale(1) rotate(0deg);
            }
          }

          @keyframes paperOverlayOpen {
            0% {
              opacity: 0;
            }
            100% {
              opacity: 1;
            }
          }

          @keyframes paperUnfold {
            0% {
              opacity: 0;
              transform: translateY(22px) scale(0.62) rotate(-10deg);
            }
            35% {
              opacity: 1;
              transform: translateY(0) scale(0.9) rotate(6deg);
            }
            70% {
              transform: translateY(-4px) scale(1.02) rotate(-1deg);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1) rotate(0deg);
            }
          }

          @keyframes paperFoldAway {
            0% {
              opacity: 1;
              transform: translateY(0) scale(1) rotate(0deg);
            }
            25% {
              opacity: 1;
              transform: translateY(0) scale(0.94) rotate(-4deg);
            }
            100% {
              opacity: 0;
              transform: translate(180px, 220px) scale(0.18) rotate(18deg);
            }
          }

          @keyframes paperContentShow {
            0% {
              opacity: 0;
              transform: translateY(10px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes paperContentHide {
            0% {
              opacity: 1;
              transform: translateY(0);
            }
            100% {
              opacity: 0;
              transform: translateY(-8px);
            }
          }

          .note-card-enter {
            animation: noteCardEnter 720ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          .note-corner-enter {
            animation: noteCornerEnter 620ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          .paper-overlay-open {
            animation: paperOverlayOpen 220ms ease-out;
          }

          .paper-unfold {
            animation: paperUnfold 560ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          .paper-idle {
            transform: translateY(0) scale(1);
          }

          .paper-fold-away {
            animation: paperFoldAway 680ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }

          .paper-content-show {
            animation: paperContentShow 280ms ease-out both;
            animation-delay: 120ms;
          }

          .paper-content-hide {
            animation: paperContentHide 180ms ease-in both;
          }
        `}
      </style>

      <section
        className={`mt-8 rounded-[32px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm ${palette.section}`}
      >
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                추억 쪽지
              </span>

              <span className={`rounded-full px-3 py-1 text-xs font-bold ${lockGuide.chipClass}`}>
                {lockGuide.chip}
              </span>
            </div>

            <h2 className="text-2xl font-black text-slate-800">
              이 저금통 안에 모인 추억들
            </h2>

            <p className="mt-2 text-sm leading-7 text-slate-500">
              {lockGuide.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
              전체 {listData.totalElements}개
            </span>

            <button
              type="button"
              onClick={openComposer}
              className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] ${palette.primaryButton}`}
            >
              새 쪽지 쓰기
            </button>
          </div>
        </div>

        <div className={`mb-6 rounded-[28px] border p-5 ${palette.panel}`}>
          <p className="mb-1 text-sm font-extrabold text-slate-800">
            {lockGuide.title}
          </p>
          <p className="text-sm text-slate-500">
            {jar?.isOpen
              ? "지금은 카드와 상세 모달에서 내용을 바로 읽을 수 있어요."
              : `현재 잠금 레벨은 ${LOCK_LEVEL_LABEL[jar?.lockLevel] || jar?.lockLevel} 상태예요.`}
          </p>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className={`mb-6 rounded-[28px] border p-4 ${palette.panelSoft}`}
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
            <input
              type="text"
              value={searchForm.q}
              onChange={(e) =>
                setSearchForm((prev) => ({ ...prev, q: e.target.value }))
              }
              placeholder="제목이나 내용으로 찾아보기"
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
            />

            <input
              type="text"
              value={searchForm.tag}
              onChange={(e) =>
                setSearchForm((prev) => ({ ...prev, tag: e.target.value }))
              }
              placeholder="태그로 찾아보기"
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
            />

            <button
              type="submit"
              className={`rounded-2xl px-4 py-3 text-sm font-bold transition hover:scale-[1.01] ${palette.primaryButton}`}
            >
              검색
            </button>

            <button
              type="button"
              onClick={handleResetSearch}
              className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${palette.outlineBtn}`}
            >
              초기화
            </button>
          </div>
        </form>

        {notesLoading && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className={`animate-pulse rounded-[28px] border p-5 ${palette.softCard}`}
              >
                <div className="mb-3 h-6 w-24 rounded-full bg-slate-200" />
                <div className="mb-3 h-6 w-40 rounded-full bg-slate-200" />
                <div className="mb-2 h-4 w-full rounded-full bg-slate-100" />
                <div className="mb-4 h-4 w-4/5 rounded-full bg-slate-100" />
                <div className="flex gap-2">
                  <div className="h-7 w-16 rounded-full bg-slate-100" />
                  <div className="h-7 w-16 rounded-full bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!notesLoading && notesError && (
          <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
            <p>{notesError}</p>

            <button
              type="button"
              onClick={() => loadNotes(query)}
              className={`mt-4 rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
            >
              다시 불러오기
            </button>
          </div>
        )}

        {!notesLoading && !notesError && listData.items.length === 0 && (
          <div className={`rounded-2xl border border-dashed px-4 py-8 text-center text-sm ${palette.emptyBox}`}>
            <div className="mb-3 text-4xl">📝</div>
            <p className="font-bold">아직 들어온 쪽지가 없어요.</p>
            <p className="mt-2 text-xs leading-6">
              첫 번째 추억을 남겨서 저금통을 채워 보자.
            </p>
          </div>
        )}

        {!notesLoading && !notesError && listData.items.length > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {listData.items.map((note) => {
                const noteId = getNoteId(note);
                const title = getVisibleTitle(note, jar);
                const summary = getCardSummary(note, jar);
                const tags = normalizeTags(note?.tags);

                const isJustCreated =
                  noteId !== null &&
                  justCreatedNoteId !== null &&
                  Number(noteId) === Number(justCreatedNoteId);

                return (
                  <button
                    key={noteId}
                    type="button"
                    onClick={() => openDetail(noteId)}
                    className={`group relative overflow-hidden text-left rounded-[28px] border p-5 transition hover:-translate-y-1 hover:shadow-lg ${palette.softCard} ${
                      isJustCreated
                        ? "note-card-enter shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                        : ""
                    }`}
                  >
                    {/* 접힌 메모 모서리 장식 */}
                    <div className="pointer-events-none absolute right-0 top-0 h-12 w-12">
                      <div
                        className={`absolute right-0 top-0 h-12 w-12 rounded-bl-[22px] border-b border-l border-white/80 ${
                          isJustCreated
                            ? "note-corner-enter bg-white/95"
                            : "bg-white/75"
                        }`}
                      />
                    </div>

                    {/* 종이 하이라이트 */}
                    <div className="pointer-events-none absolute left-4 top-4 h-10 w-3 rounded-full bg-white/30 blur-sm" />

                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          jar?.isOpen
                            ? "bg-emerald-100 text-emerald-700"
                            : palette.countChip
                        }`}
                      >
                        {jar?.isOpen
                          ? "내용 확인 가능"
                          : LOCK_LEVEL_LABEL[jar?.lockLevel] || "잠금 중"}
                      </span>

                      {note.noteDate && (
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                          {formatDateOnly(note.noteDate)}
                        </span>
                      )}
                    </div>

                    <h3 className="mb-2 pr-8 text-lg font-black text-slate-800">
                      {title}
                    </h3>

                    <p className="min-h-[52px] text-sm leading-6 text-slate-500">
                      {summary}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {toSafeText(note.location) && (
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.outlineButton}`}>
                          {note.location}
                        </span>
                      )}

                      {tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${palette.outlineButton}`}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 border-t border-white/70 pt-3">
                      <p className="text-xs font-semibold text-slate-400">
                        작성 시간: {formatDate(note.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {listData.totalPages > 1 && (
              <div className="mt-6 flex flex-col gap-3 border-t border-white/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {listData.page + 1} / {listData.totalPages} 페이지
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleMovePage(Math.max(0, listData.page - 1))}
                    disabled={listData.page === 0}
                    className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineBtn}`}
                  >
                    이전
                  </button>

                  {Array.from(
                    { length: listData.totalPages },
                    (_, index) => index
                  ).map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => handleMovePage(pageNumber)}
                      className={`rounded-2xl px-3 py-2 text-sm font-bold transition ${
                        pageNumber === listData.page
                          ? palette.primaryButton
                          : palette.outlineButton
                      }`}
                    >
                      {pageNumber + 1}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      handleMovePage(
                        Math.min(listData.totalPages - 1, listData.page + 1)
                      )
                    }
                    disabled={listData.page + 1 >= listData.totalPages}
                    className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineBtn}`}
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <PaperComposeModal
        open={paperVisible}
        phase={composerPhase}
        step={composerStep}
        form={writeForm}
        setForm={setWriteForm}
        palette={palette}
        loading={createLoading}
        onClose={closeComposer}
        onShowPreview={handleOpenPreview}
        onShowConfirm={handleOpenConfirm}
        onBackToForm={handleBackToForm}
        onBackToPreview={handleBackToPreview}
        onSubmit={handleCreateNote}
      />

      <NoteDetailModal
        open={detailOpen}
        note={detailNote}
        loading={detailLoading}
        error={detailError}
        jar={jar}
        palette={palette}
        formatDate={formatDate}
        onClose={closeDetail}
        onRetry={() => openDetail(detailNoteId)}
      />
    </>
  );
}