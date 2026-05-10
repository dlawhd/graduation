// src/pages/NoteSection.jsx

import { useEffect, useMemo, useState } from "react";
import noteApi from "../api/noteApi";
import fileApi from "../api/fileApi";
import MemoryDrawNoteIcon from "../components/icons/MemoryDrawNoteIcon";
import NoteIntoJarIcon from "../components/icons/NoteIntoJarIcon";

// 잠금 레벨을 화면용으로 바꿔주는 작은 사전
const LOCK_LEVEL_LABEL = {
  HIDDEN: "완전 비밀",
  META_ONLY: "메타만 공개",
  TITLE_ONLY: "제목만 공개",
};

// 리액션 enum 값을 화면용 이모지/이름으로 바꿔주는 표
const REACTION_META = {
  LOVE: { emoji: "❤️", label: "사랑해" },
  SMILE: { emoji: "😊", label: "좋아" },
  LAUGH: { emoji: "😂", label: "웃겨" },
  TOUCHING: { emoji: "🥹", label: "감동" },
  MISS_YOU: { emoji: "🫶", label: "보고 싶어" },
  PROUD: { emoji: "🥰", label: "뿌듯해" },
  CHEER: { emoji: "👏", label: "응원해" },
  THANKFUL: { emoji: "🙏", label: "고마워" },
};

// 버튼 보여줄 순서
const REACTION_ORDER = [
  "LOVE",
  "SMILE",
  "LAUGH",
  "TOUCHING",
  "MISS_YOU",
  "PROUD",
  "CHEER",
  "THANKFUL",
];

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



// reactionCounts 배열을 안전하게 정리
function normalizeReactionCounts(counts) {
  if (!Array.isArray(counts)) return [];
  return counts.filter((item) => item && item.emoji);
}

// 특정 리액션 개수 찾기
function getReactionCount(note, emoji) {
  const counts = normalizeReactionCounts(note?.reactionCounts);
  const found = counts.find((item) => item.emoji === emoji);
  return found?.count ?? 0;
}

// 리액션 응답을 기존 note 객체에 합쳐주는 함수
function mergeReactionSummary(note, summary) {
  if (!note) return note;

  return {
    ...note,
    myReaction: summary?.myReaction ?? null,
    reactionCounts: Array.isArray(summary?.counts)
      ? summary.counts
      : Array.isArray(summary?.reactionCounts)
      ? summary.reactionCounts
      : [],
  };
}



// 작성 요청용 payload 만들기
// 이 함수는 "서버에 보낼 최종 note 생성 데이터"를 만드는 역할을 함
// 화면 미리보기에 필요한 정보는 form.attachments 안에 그대로 두고, 서버에는 s3Key만 보내도록 바꾼다.
function buildCreatePayload(form) {
  const title = toSafeText(form.title);
  const content = toSafeText(form.content);
  const location = toSafeText(form.location);
  const tags = normalizeTags(form.tagsText);

  const payload = {
    title,
    content,
    attachments: Array.isArray(form.attachments)
      ? form.attachments
          .filter((attachment) => toSafeText(attachment?.s3Key))
          .map((attachment) => ({
            s3Key: attachment.s3Key,
          }))
      : [],
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
  setFormError,
  palette,
  loading,
  formError,
  uploading,
  uploadError,
  handleAttachFiles,
  handleRemoveAttachment,
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

      {/* 새 쪽지 모달 안쪽 스크롤바 디자인 */}
      <style>
        {`
          .paper-compose-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
          }

          .paper-compose-scroll::-webkit-scrollbar {
            width: 8px;
          }

          .paper-compose-scroll::-webkit-scrollbar-track {
            background: transparent;
            margin: 16px 0;
          }

          .paper-compose-scroll::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.45);
            border-radius: 999px;
            border: 2px solid rgba(255, 253, 248, 0.95);
          }

          .paper-compose-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 116, 139, 0.65);
          }
        `}
      </style>

      {/* 종이 본체 */}
      <div className={`relative flex max-h-[88vh] w-full max-w-2xl origin-center ${paperAnimationClass}`}>
        <div className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(180deg,#fffdf8_0%,#fff8ef_100%)] shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
          {/* 접힌 모서리 */}
          <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-[28px] border-b border-l border-white/80 bg-white/80" />

          {/* 꾸깃한 종이 느낌 장식 */}
          <div className="pointer-events-none absolute left-8 top-10 h-20 w-[2px] rotate-[10deg] bg-slate-200/60" />
          <div className="pointer-events-none absolute right-16 top-16 h-24 w-[2px] -rotate-[14deg] bg-slate-200/50" />
          <div className="pointer-events-none absolute left-20 bottom-14 h-16 w-[2px] rotate-[18deg] bg-slate-200/50" />
          <div className="pointer-events-none absolute left-6 top-6 h-24 w-10 rounded-full bg-white/45 blur-md" />

          <div className={`relative z-10 flex min-h-0 flex-1 flex-col ${contentAnimationClass}`}>
            {/* 헤더는 위에 고정된 영역처럼 분리 */}
            <div className="shrink-0 border-b border-amber-100/70 bg-[#fffdf8]/95 px-6 pb-4 pt-6">
              <div className="flex items-center justify-between gap-3">
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
            </div>

            {/* 아래 내용만 스크롤되는 영역 */}
            <div className="paper-compose-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5">


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
                    onChange={(e) => {
                      const nextValue = e.target.value;

                      setForm((prev) => ({ ...prev, title: nextValue }));

                      if (toSafeText(nextValue)) {
                        setFormError((prev) => ({ ...prev, title: "" }));
                      }
                    }}
                    placeholder="예: 우리 첫 여행"
                    required
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  />
                  {formError?.title && (
                    <p className="mt-2 text-sm font-semibold text-rose-500">
                      {formError.title}
                    </p>
                  )}
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">
                    내용 (필수)
                  </span>
                  <textarea
                    rows="7"
                    value={form.content}
                    onChange={(e) => {
                      const nextValue = e.target.value;

                      setForm((prev) => ({ ...prev, content: nextValue }));

                      if (toSafeText(nextValue)) {
                        setFormError((prev) => ({ ...prev, content: "" }));
                      }
                    }}
                    placeholder="남기고 싶은 추억을 자유롭게 적어 주세요."
                    required
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  />
                  {formError?.content && (
                    <p className="mt-2 text-sm font-semibold text-rose-500">
                      {formError.content}
                    </p>
                  )}
                </label>

                {/* 사용자가 파일을 고르고, 업로드가 끝난 뒤, “지금 note에 붙을 첨부 목록”을 눈으로 볼 수 있음 */}
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">
                    첨부 파일 (선택)
                  </span>

                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleAttachFiles}
                    disabled={uploading || loading}
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  />

                  <p className="mt-2 text-xs text-slate-400">
                    사진이나 영상을 10개 올릴 수 있어요.
                  </p>

                  {uploading && (
                    <p className="mt-2 text-sm font-semibold text-emerald-600">
                      파일을 올리고 있어요...
                    </p>
                  )}

                  {uploadError && (
                    <p className="mt-2 text-sm font-semibold text-rose-500">
                      {uploadError}
                    </p>
                  )}
                </label>

                {Array.isArray(form.attachments) && form.attachments.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500">업로드된 첨부</p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {form.attachments.map((attachment, index) => {
                        const isImage = attachment.contentType?.startsWith("image/");
                        const isVideo = attachment.contentType?.startsWith("video/");

                        return (
                          <div
                            key={`${attachment.s3Key}-${index}`}
                            className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80"
                          >
                            <div className="flex h-44 items-center justify-center bg-slate-50">
                              {isImage ? (
                                <img
                                  src={attachment.previewUrl || attachment.thumbnailUrl || attachment.url}
                                  alt={`첨부 ${index + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              ) : isVideo ? (
                                <video
                                  src={attachment.previewUrl || attachment.url}
                                  controls
                                  className="h-full w-full bg-black object-cover"
                                />
                              ) : (
                                <div className="px-4 text-center text-xs font-semibold text-slate-500">
                                  미리보기를 지원하지 않는 파일이에요.
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-700">
                                  {attachment.s3Key}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {attachment.contentType} · {attachment.size} bytes
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(index)}
                                className="rounded-xl border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-50"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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

                    {Array.isArray(form.attachments) && form.attachments.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/60 p-4">
                        <p className="mb-3 text-xs font-semibold text-slate-500">
                          함께 들어갈 첨부
                        </p>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {form.attachments.map((attachment, index) => {
                            const isImage = attachment.contentType?.startsWith("image/");
                            const isVideo = attachment.contentType?.startsWith("video/");

                            return (
                              <div
                                key={`${attachment.s3Key}-${index}`}
                                className="overflow-hidden rounded-2xl border border-slate-100 bg-white"
                              >
                                <div className="flex h-44 items-center justify-center bg-slate-50">
                                  {isImage ? (
                                    <img
                                      src={attachment.previewUrl || attachment.thumbnailUrl || attachment.url}
                                      alt={`첨부 ${index + 1}`}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : isVideo ? (
                                    <video
                                      src={attachment.previewUrl || attachment.url}
                                      controls
                                      className="h-full w-full bg-black object-cover"
                                    />
                                  ) : (
                                    <div className="px-4 text-center text-xs font-semibold text-slate-500">
                                      미리보기를 지원하지 않는 파일이에요.
                                    </div>
                                  )}
                                </div>

                                <div className="px-3 py-2">
                                  <p className="truncate text-sm font-semibold text-slate-700">
                                    {attachment.s3Key}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {attachment.contentType} · {attachment.size} bytes
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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

                <NoteIntoJarIcon
                  className="mb-4"
                  sizeClass="h-28 w-28"
                  withShadow={true}
                />

                <p className="text-sm leading-7 text-slate-500">
                  저금통에 넣으면 쪽지 수정이나 삭제가 불가능해요!
                </p>

                <h3 className="mb-2 text-xl font-black text-slate-800">
                    이 쪽지를 정말 넣을까요?
                </h3>

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
                    disabled={loading || uploading}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
                  >
                    {uploading ? "파일 업로드 중..." : loading ? "넣는 중..." : "저금통에 넣기"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

/*
 * 이 컴포넌트는 리액션 버튼들을 한 줄로 보여주는 역할을 해.
 * - 현재 내가 누른 리액션은 강조해서 보여주고
 * - 각 리액션 개수도 같이 보여줘.
 */
function ReactionBar({
  note,
  palette,
  disabled = false,
  loading = false,
  onReact,
}) {
  const currentReaction = note?.myReaction ?? null;

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        리액션
      </p>

      <div className="flex flex-wrap gap-2">
        {REACTION_ORDER.map((reactionKey) => {
          const meta = REACTION_META[reactionKey];
          const isActive = currentReaction === reactionKey;
          const count = getReactionCount(note, reactionKey);

          return (
            <button
              key={reactionKey}
              type="button"
              disabled={disabled || loading}
              onClick={(e) => {
                e.stopPropagation();
                onReact?.(reactionKey);
              }}
              title={meta.label}
              className={`rounded-2xl border px-3 py-2 text-sm font-bold transition ${
                isActive ? palette.primaryButton : palette.outlineButton
              } ${
                disabled || loading
                  ? "cursor-not-allowed opacity-60"
                  : "hover:scale-[1.02]"
              }`}
            >
              <span className="mr-1">{meta.emoji}</span>
              <span>{count}</span>
            </button>
          );
        })}
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
  onReact,
  reacting,
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

            <ReactionBar
              note={note}
              palette={palette}
              disabled={!jar?.isOpen}
              loading={reacting}
              onReact={onReact}
            />

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

            {Array.isArray(note?.attachments) && note.attachments.length > 0 && (
              <section className="mt-6">
                <h4 className="mb-3 text-sm font-bold text-slate-700">첨부</h4>

                <div className="grid gap-3 sm:grid-cols-2">
                  {note.attachments.map((attachment, index) => {
                    const isImage = attachment.contentType?.startsWith("image/");

                    return (
                      <div
                        key={`${attachment.s3Key}-${index}`}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        {isImage ? (
                          <img
                            src={attachment.thumbnailUrl || attachment.url}
                            alt={`첨부 ${index + 1}`}
                            className="h-44 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-44 items-center justify-center bg-slate-50 text-sm font-semibold text-slate-400">
                            미리보기를 준비하지 못했어요.
                          </div>
                        )}

                        <div className="p-3">
                          <p className="truncate text-sm font-semibold text-slate-700">
                            {attachment.s3Key}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {attachment.contentType} · {attachment.size} bytes
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

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

export default function NoteSection({
  jar,
  palette,
  formatDate,
  showCreateButton = true,
  showSearchControls = true,
  createRequestId = 0,
  getJarDropTargetRect,
}) {

  // 목록 첫 로딩 때 사용할 기본 검색 조건
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

  // 입력 에러 문구를 저장하는 상태
  const [formError, setFormError] = useState({
    title: "",
    content: "",
  });

  // 토스트 메시지를 저장하는 상태
  const [toast, setToast] = useState({
    show: false,
    type: "success", // success | error
    message: "",
  });

  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailNoteId, setDetailNoteId] = useState(null);
  const [detailNote, setDetailNote] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // 지금 어떤 note에 리액션 요청이 진행 중인지 저장
  const [reactingNoteId, setReactingNoteId] = useState(null);

const [paperVisible, setPaperVisible] = useState(false);
const [composerPhase, setComposerPhase] = useState("closed");
const [composerStep, setComposerStep] = useState("form");
const [createLoading, setCreateLoading] = useState(false);
const [justCreatedNoteId, setJustCreatedNoteId] = useState(null);

  // 저장 완료 후 저금통으로 날아가는 작은 쪽지 상태
  const [flyingNote, setFlyingNote] = useState(null);

  const [writeForm, setWriteForm] = useState({
    title: "",
    content: "",
    noteDate: "",
    location: "",
    tagsText: "",
    attachments: [],
  });

  // 첨부 업로드 중인지, 업로드 에러가 났는지
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const lockGuide = useMemo(() => getLockGuide(jar), [jar]);

  // 화면에 잠깐 뜨는 토스트를 보여주는 함수
  function showToast(type, message) {
    setToast({
      show: true,
      type,
      message,
    });

    window.setTimeout(() => {
      setToast((prev) => ({
        ...prev,
        show: false,
      }));
    }, 3000);
  }

  // 제목과 내용을 검사해서 에러 문구를 만들어주는 함수
  function validateWriteForm(form) {
    const nextError = {
      title: "",
      content: "",
    };

    const title = toSafeText(form.title);
    const content = toSafeText(form.content);

    if (!title) {
      nextError.title = "제목을 꼭 입력해 주세요.";
    }

    if (!content) {
      nextError.content = "내용을 꼭 입력해 주세요.";
    }

    setFormError(nextError);

    // 둘 다 비어있지 않으면 true
    return !nextError.title && !nextError.content;
  }

  // 화면 가운데에서 저금통 입구까지 쪽지를 날려 보내는 함수
  function startFlyingNoteToJar() {
    const target = getJarDropTargetRect?.();

    if (!target) {
      return 0;
    }

    const noteWidth = 76;
    const noteHeight = 92;

    // 모달이 화면 가운데에서 열리니까 시작점도 화면 가운데로 잡아줘
    const startX = window.innerWidth / 2 - noteWidth / 2;
    const startY = window.innerHeight / 2 - noteHeight / 2;

    const endX = target.x - noteWidth / 2;
    const endY = target.y - noteHeight / 2;

    const nextFlight = {
      id: Date.now(),
      startX,
      startY,
      deltaX: endX - startX,
      deltaY: endY - startY,
    };

    setFlyingNote(nextFlight);

    // 애니메이션 끝나면 화면에서 제거
    window.setTimeout(() => {
      setFlyingNote((current) =>
        current?.id === nextFlight.id ? null : current
      );
    }, 920);

    return 920;
  }

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

      console.log("detail data =", data);
      console.log("detail data.attachments =", data?.attachments);

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

  // 목록 카드 중 딱 1개만 리액션 정보 갱신
  function patchNoteInList(noteId, summary) {
    setListData((prev) => ({
      ...prev,
      items: (prev.items || []).map((item) =>
        getNoteId(item) === noteId ? mergeReactionSummary(item, summary) : item
      ),
    }));
  }

  // 상세 모달에 열려 있는 note도 같이 갱신
  function patchDetailNote(noteId, summary) {
    setDetailNote((prev) => {
      if (!prev) return prev;
      if (getNoteId(prev) !== noteId) return prev;
      return mergeReactionSummary(prev, summary);
    });
  }

  // 사용자가 리액션 버튼을 눌렀을 때 호출되는 함수
  async function handleReactToNote(noteId, emoji) {
    if (!jar?.jarId || !noteId) return;

    if (!jar?.isOpen) {
      showToast("error", "저금통이 열린 뒤에 리액션을 남길 수 있어요.");
      return;
    }

    setReactingNoteId(noteId);

    try {
      // 백엔드가 알아서 생성 / 취소 / 변경을 처리해 줘
      const summary = await noteApi.reactToNote(jar.jarId, noteId, emoji);

      // 상세 모달이 열려 있으면 상세도 갱신
      patchDetailNote(noteId, summary);

      // 목록 카드도 해당 note만 부분 갱신
      patchNoteInList(noteId, summary);
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "리액션 처리에 실패했어요.";

      showToast("error", serverMessage);
    } finally {
      setReactingNoteId(null);
    }
  }

function resetWriteForm() {
  (writeForm.attachments || []).forEach((attachment) => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  });

  setWriteForm({
    title: "",
    content: "",
    noteDate: "",
    location: "",
    tagsText: "",
    attachments: [],
  });

  setFormError({
    title: "",
    content: "",
  });

  setUploadError("");
}

function openComposer() {
  setFormError({
    title: "",
    content: "",
  });

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
  const isValid = validateWriteForm(writeForm);

  if (!isValid) {
    showToast("error", "필수 입력값을 먼저 확인해 주세요.");
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
  const isValid = validateWriteForm(writeForm);

  if (!isValid) {
    showToast("error", "제목과 내용을 입력한 뒤 다시 시도해 주세요.");
    return;
  }


  const payload = buildCreatePayload(writeForm);

  setCreateLoading(true);
  setComposerPhase("submitting");

  try {
    // 서버 저장 먼저 시작
    const createPromise = noteApi.createNote(jar.jarId, payload);

    // 종이가 한 번 접히는 느낌을 잠깐 보여줌
    await wait(420);

    const createdNote = await createPromise;
    const createdNoteId = getNoteId(createdNote);

    // 모달은 먼저 닫아줘
    setPaperVisible(false);
    setComposerPhase("closed");
    setComposerStep("form");

    // 작은 접힌 쪽지를 저금통 쪽으로 날려 보냄
    const flightDuration = startFlyingNoteToJar();

    // 입력 폼도 초기화
    resetWriteForm();

    // 쪽지가 날아가는 시간만큼 잠깐 기다렸다가 목록 갱신
    if (flightDuration > 0) {
      await wait(Math.max(0, flightDuration - 120));
    }

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

    showToast("success", "쪽지를 저금통에 넣었어요.");
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "쪽지 작성에 실패했어요.";

    setComposerPhase("ready");
    setComposerStep("confirm");

    showToast("error", serverMessage);
  } finally {
    setCreateLoading(false);
  }
}

   // 파일을 고르면
   // 1) presign 요청
   // 2) S3 업로드
   // 3) complete 요청
   // 4) 미리보기용 첨부 상태 저장
   async function handleAttachFiles(e) {
     const files = Array.from(e.target.files || []);
     if (files.length === 0) return;

     setUploadError("");
     setUploading(true);

     try {
       const uploadedAttachments = [];

       for (const file of files) {
         // 1. presign 받기
         const presignData = await fileApi.presignNoteFile({
           fileName: file.name,
           contentType: file.type,
           size: file.size,
         });

         // 2. S3에 실제 업로드
         await fileApi.uploadFileToS3(
           presignData.uploadUrl,
           file,
           file.type
         );

         // 3. 업로드 완료 확인
         await fileApi.completeNoteFile({
           s3Key: presignData.s3Key,
         });

         // 4. 화면 미리보기용 정보 저장
         const attachmentPayload = fileApi.toNoteAttachmentPayload(presignData, file);

         uploadedAttachments.push({
           ...attachmentPayload,
           previewUrl: URL.createObjectURL(file),
         });
       }

       setWriteForm((prev) => ({
         ...prev,
         attachments: [...(prev.attachments || []), ...uploadedAttachments],
       }));
     } catch (error) {
       const serverMessage =
         error?.response?.data?.error?.message ||
         error?.response?.data?.message ||
         error?.message ||
         "파일 업로드에 실패했어요.";

       setUploadError(serverMessage);
     } finally {
       setUploading(false);
       e.target.value = "";
     }
   }

   // 첨부 삭제
   function handleRemoveAttachment(index) {
     setWriteForm((prev) => {
       const target = prev.attachments?.[index];

       if (target?.previewUrl) {
         URL.revokeObjectURL(target.previewUrl);
       }

       return {
         ...prev,
         attachments: (prev.attachments || []).filter((_, i) => i !== index),
       };
     });
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

  useEffect(() => {
    if (!createRequestId) return;
    openComposer();
  }, [createRequestId]);

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

          @keyframes noteFlightToJar {
            0% {
              opacity: 1;
              transform: translate(0, 0) scale(1) rotate(-8deg);
            }
            35% {
              opacity: 1;
              transform: translate(
                calc(var(--note-dx) * 0.34),
                calc(var(--note-dy) * 0.22 - 26px)
              ) scale(0.92) rotate(6deg);
            }
            75% {
              opacity: 1;
              transform: translate(
                calc(var(--note-dx) * 0.82),
                calc(var(--note-dy) * 0.86)
              ) scale(0.46) rotate(12deg);
            }
            100% {
              opacity: 0;
              transform: translate(var(--note-dx), var(--note-dy)) scale(0.16) rotate(18deg);
            }
          }

          .note-flight-paper {
            position: fixed;
            width: 76px;
            height: 92px;
            pointer-events: none;
            z-index: 140;
            animation: noteFlightToJar 920ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
            filter: drop-shadow(0 18px 28px rgba(15, 23, 42, 0.2));
          }
        `}
      </style>

      <PaperComposeModal
        open={paperVisible}
        phase={composerPhase}
        step={composerStep}
        form={writeForm}
        setForm={setWriteForm}
        setFormError={setFormError}
        palette={palette}
        loading={createLoading}
        formError={formError}
        uploading={uploading}
        uploadError={uploadError}
        handleAttachFiles={handleAttachFiles}
        handleRemoveAttachment={handleRemoveAttachment}
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
        reacting={reactingNoteId === detailNoteId}
        onReact={(emoji) => handleReactToNote(detailNoteId, emoji)}
      />
      {flyingNote && (
        <div
          className="note-flight-paper"
          style={{
            left: `${flyingNote.startX}px`,
            top: `${flyingNote.startY}px`,
            "--note-dx": `${flyingNote.deltaX}px`,
            "--note-dy": `${flyingNote.deltaY}px`,
          }}
        >
          {/* 저금통으로 날아가는 쪽지도 같은 SVG를 사용한다.
              작은 크기와 장식 없는 버전으로 써서 움직일 때 깔끔하게 보이게 한다. */}
          <MemoryDrawNoteIcon
            sizeClass="h-full w-full"
            withShadow={false}
            withDecorations={false}
            centered={false}
          />
        </div>
      )}
      {toast.show && (
        <div className="fixed right-6 top-6 z-[120]">
          <div
            className={`min-w-[260px] rounded-2xl border px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-sm ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            <p className="text-sm font-bold">
              {toast.type === "success" ? "완료" : "확인해 주세요"}
            </p>
            <p className="mt-1 text-sm">{toast.message}</p>
          </div>
        </div>
      )}
    </>
  );
}
