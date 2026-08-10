import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactionBar from "./ReactionBar";
import { getThemeIcon } from "../theme/jarDetailTheme";
import { normalizeJarZoomTags } from "../utils/jarDetailUtils";

/*
 * JarZoomModal 역할
 *
 * 저금통을 크게 들여다보는 모달 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 오픈 전에는 저금통만 크게 보여주고
 * - 오픈 후에는 저금통 안 쪽지들과 오른쪽 쪽지 목록을 보여주고
 * - 제목/내용/장소/태그로 쪽지를 검색할 수 있게 해준다.
 *
 * 이 컴포넌트는 직접 서버 요청을 하지 않고,
 * 부모인 JarDetailPage가 넘겨준 notes, loading, error 값으로 화면만 그린다.
 */
export default function JarZoomModal({
  open,
  jar,
  notes,
  loading,
  error,
  palette,
  onClose,
  onRetry,
  onOpenNoteDetail,
  onReactNote,
  reactingNoteId,
}) {
  const NOTES_PER_PAGE = 3;

  // notes가 혹시 배열이 아니어도 화면이 터지지 않게 안전하게 맞춘다.
  const safeNotes = Array.isArray(notes) ? notes : [];

  // 저금통이 실제로 열렸는지 확인하는 값이야.
  // true면 오른쪽 쪽지 목록을 보여주고,
  // false면 저금통만 보여줘서 비밀 느낌을 유지해.
  const isJarOpen = !!jar?.isOpen;

  // 오픈 전에는 쪽지 목록을 화면 계산에 쓰지 않는다.
  // 그래야 쪽지 개수나 검색 결과가 노출되지 않아.
  const visibleNotes = isJarOpen ? safeNotes : [];

  // 오른쪽 검색창 상태
  const [searchForm, setSearchForm] = useState({
    q: "",
    tag: "",
  });

  // 오른쪽 목록 페이지
  const [notePage, setNotePage] = useState(1);

  // 검색어/태그 기준으로 필터링
  const filteredNotes = useMemo(() => {
    const q = searchForm.q.trim().toLowerCase();
    const tag = searchForm.tag.trim().toLowerCase();

    return visibleNotes.filter((note) => {
      const title =
        typeof note?.title === "string" ? note.title.toLowerCase() : "";

      const content =
        typeof note?.content === "string" ? note.content.toLowerCase() : "";

      const location =
        typeof note?.location === "string"
          ? note.location.toLowerCase()
          : "";

      const tags = normalizeJarZoomTags(note?.tags).map((item) =>
        item.toLowerCase()
      );

      const matchesQ =
        !q ||
        title.includes(q) ||
        content.includes(q) ||
        location.includes(q);

      const matchesTag = !tag || tags.some((item) => item.includes(tag));

      return matchesQ && matchesTag;
    });
  }, [visibleNotes, searchForm]);

  // 왼쪽 저금통 안에 보여줄 쪽지도 검색 결과 기준으로 8개만
  const previewNotes = useMemo(() => {
    return filteredNotes.slice(0, 8);
  }, [filteredNotes]);

  // 오른쪽 총 페이지 수
  const notePageCount = useMemo(() => {
    return Math.max(1, Math.ceil(filteredNotes.length / NOTES_PER_PAGE));
  }, [filteredNotes]);

  // 오른쪽 현재 페이지 3개
  const pagedNotes = useMemo(() => {
    const startIndex = (notePage - 1) * NOTES_PER_PAGE;
    return filteredNotes.slice(startIndex, startIndex + NOTES_PER_PAGE);
  }, [filteredNotes, notePage]);

  // 왼쪽 둥둥 떠다니는 쪽지들
  const floatingNotes = useMemo(() => {
    return previewNotes.map((note, index) => {
      const topList = [20, 28, 35, 43, 51, 59, 32, 47];
      const leftList = [18, 47, 30, 56, 22, 50, 40, 62];
      const rotateList = [-12, 9, -7, 11, -9, 8, -5, 10];
      const durationList = [4.8, 5.6, 5.2, 6.0, 4.9, 5.8, 5.1, 6.2];
      const delayList = [0, 0.4, 0.8, 1.1, 0.2, 1.4, 0.6, 1.7];
      const driftXList = [-8, 10, -6, 12, -10, 7, -5, 9];
      const driftYList = [-12, -9, -14, -10, -13, -8, -11, -9];

      return {
        id: note?.noteId ?? note?.id ?? `floating-note-${index}`,
        note,
        top: topList[index % topList.length],
        left: leftList[index % leftList.length],
        rotate: rotateList[index % rotateList.length],
        duration: durationList[index % durationList.length],
        delay: delayList[index % delayList.length],
        driftX: driftXList[index % driftXList.length],
        driftY: driftYList[index % driftYList.length],
      };
    });
  }, [previewNotes]);

  // 모달 새로 열릴 때 검색 초기화 + 첫 페이지
  useEffect(() => {
    if (!open) return;

    setSearchForm({
      q: "",
      tag: "",
    });

    setNotePage(1);
  }, [open]);

  // 검색 결과 바뀌면 1페이지로 이동한다.
  useEffect(() => {
    setNotePage(1);
  }, [searchForm.q, searchForm.tag]);

  // 페이지가 범위 밖으로 벗어나면 자동으로 마지막 페이지로 보정한다.
  useEffect(() => {
    if (notePage > notePageCount) {
      setNotePage(notePageCount);
    }
  }, [notePage, notePageCount]);

  function handleResetSearch() {
    setSearchForm({
      q: "",
      tag: "",
    });
  }

  // Hook과 함수 선언이 끝난 뒤에 return null 처리해야 한다.
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9991] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/55 px-4 py-4 sm:py-6">
      <style>
        {`
          @keyframes jarZoomPop {
            0% {
              opacity: 0;
              transform: translateY(18px) scale(0.82);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .jar-zoom-pop {
            animation: jarZoomPop 280ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          @keyframes floatJarNote {
            0% {
              transform: translate(0, 0) rotate(var(--note-rotate));
            }
            25% {
              transform:
                translate(calc(var(--drift-x) * 0.6), calc(var(--drift-y) * 0.4))
                rotate(calc(var(--note-rotate) + 4deg));
            }
            50% {
              transform:
                translate(var(--drift-x), var(--drift-y))
                rotate(calc(var(--note-rotate) - 3deg));
            }
            75% {
              transform:
                translate(calc(var(--drift-x) * 0.45), calc(var(--drift-y) * 0.65))
                rotate(calc(var(--note-rotate) + 2deg));
            }
            100% {
              transform: translate(0, 0) rotate(var(--note-rotate));
            }
          }

          .jar-floating-note {
            animation-name: floatJarNote;
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
            animation-direction: alternate;
          }

          .jar-zoom-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
          }

          .jar-zoom-scroll::-webkit-scrollbar {
            width: 8px;
          }

          .jar-zoom-scroll::-webkit-scrollbar-track {
            background: transparent;
            margin: 16px 0;
          }

          .jar-zoom-scroll::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.45);
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.95);
          }

          .jar-zoom-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 116, 139, 0.65);
          }

          .jar-zoom-note-list-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
          }

          .jar-zoom-note-list-scroll::-webkit-scrollbar {
            width: 8px;
          }

          .jar-zoom-note-list-scroll::-webkit-scrollbar-track {
            background: transparent;
            margin: 12px 0;
          }

          .jar-zoom-note-list-scroll::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.45);
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.95);
          }

          .jar-zoom-note-list-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 116, 139, 0.65);
          }
        `}
      </style>

      <div className="jar-zoom-pop relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[34px] border border-white/70 bg-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-sm sm:max-h-[calc(100dvh-3rem)]">
        {/* 상단 제목/닫기 영역 */}
        <div className="shrink-0 border-b border-slate-100/80 bg-white/95 px-6 pb-4 pt-6 lg:px-8 lg:pt-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-black text-slate-800">
                저금통 안 들여다보기
              </p>

              <p className="mt-1 text-sm text-slate-500">
                화면 가운데에서 저금통을 크게 보고 안에 쪽지가 얼마나
                들어왔는지 확인할 수 있어요.
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
        </div>

        {/* 모달 본문 영역 */}
        <div className="jar-zoom-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5 lg:px-8 lg:pb-8">
          <div
            className={
              isJarOpen
                ? "grid min-h-0 gap-6 lg:h-full lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch"
                : "grid min-h-0 items-start gap-6"
            }
          >
            {/* 왼쪽: 확대 저금통 */}
            <section
              className={`rounded-[30px] border p-6 shadow-sm ${
                isJarOpen
                  ? "flex self-stretch lg:h-full flex-col"
                  : "self-start mx-auto w-full max-w-3xl"
              } ${palette.panel}`}
            >
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}
                >
                  {isJarOpen ? "OPEN" : "LOCKED"}
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}
                >
                  {isJarOpen ? `쪽지 ${safeNotes.length}개` : "비밀 보관 중"}
                </span>
              </div>

              <div className="relative mx-auto flex h-[520px] max-w-[430px] items-center justify-center">
                <div
                  className={`absolute inset-8 rounded-full blur-3xl ${palette.floating}`}
                />

                {/* 큰 뚜껑 */}
                <div
                  className={`absolute top-[86px] z-20 h-14 w-52 rounded-full ${palette.lid} shadow-lg`}
                />
                <div className="absolute top-[103px] z-30 h-3 w-20 rounded-full bg-slate-700/80" />

                {/* 큰 저금통 몸통 */}
                <div
                  className={`relative z-10 mt-14 h-[360px] w-[280px] overflow-hidden rounded-[42%_42%_28%_28%] border-[5px] ${palette.jarBody} shadow-[0_24px_60px_rgba(15,23,42,0.16)]`}
                >
                  <div className="absolute left-8 top-10 h-40 w-10 rounded-full bg-white/55 blur-sm" />
                  <div className="absolute right-10 top-16 h-24 w-5 rounded-full bg-white/38 blur-sm" />

                  {/* 저금통 안 쪽지들 */}
                  {!loading && !error && floatingNotes.length > 0 && (
                    <div className="absolute inset-0">
                      {floatingNotes.map((item) => {
                        const note = item.note;

                        return (
                          <div
                            key={item.id}
                            className="jar-floating-note absolute flex h-[78px] w-[92px] items-center justify-center rounded-[18px] border-2 border-sky-300 bg-white/88 p-2 text-center shadow-[0_10px_22px_rgba(15,23,42,0.12)]"
                            style={{
                              top: `${item.top}%`,
                              left: `${item.left}%`,
                              "--note-rotate": `${item.rotate}deg`,
                              "--drift-x": `${item.driftX}px`,
                              "--drift-y": `${item.driftY}px`,
                              animationDuration: `${item.duration}s`,
                              animationDelay: `${item.delay}s`,
                              transform: `rotate(${item.rotate}deg)`,
                            }}
                          >
                            <div className="absolute right-0 top-0 h-4 w-4 rounded-bl-[10px] border-b-2 border-l-2 border-sky-300 bg-white/80" />

                            <p className="line-clamp-2 px-2 text-center text-[11px] font-black leading-4 text-slate-700">
                              {note?.title || "제목 없는 쪽지"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 비어 있음 */}
                  {!loading && !error && previewNotes.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <div className="flex h-[82px] w-[82px] items-center justify-center">
                        {getThemeIcon(jar?.theme, 76)}
                      </div>

                      <div className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow">
                        {isJarOpen
                          ? "아직 쪽지가 없어요"
                          : "오픈 전까지 비밀이에요!"}
                      </div>
                    </div>
                  )}

                  {/* 로딩 */}
                  {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      <div className="h-24 w-24 animate-pulse rounded-full bg-white/60" />
                      <div className="h-5 w-36 animate-pulse rounded-full bg-white/70" />
                    </div>
                  )}

                  {/* 에러 */}
                  {!loading && error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                      <p className="text-sm font-bold text-slate-700">
                        쪽지를 불러오지 못했어요.
                      </p>

                      <p className="text-xs leading-6 text-slate-500">
                        {error}
                      </p>

                      <button
                        type="button"
                        onClick={onRetry}
                        className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
                      >
                        다시 불러오기
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 저금통 안내 문구 */}
              {isJarOpen && (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-center text-xs font-semibold leading-6 ${palette.infoBox}`}
                >
                  <p>저금통 안에는 최대 8개의 쪽지만 미리 보여요.</p>
                  <p>전체 쪽지는 목록에서 확인할 수 있어요.</p>
                </div>
              )}
            </section>

            {/* 오른쪽: 쪽지 요약 목록 */}
            {isJarOpen && (
              <aside
                className={`flex min-h-0 flex-col overflow-hidden rounded-[30px] border p-6 shadow-sm lg:h-full ${palette.panel}`}
              >
                {/* 검색창 위쪽 영역 */}
                <div className="shrink-0">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}
                    >
                      저금통 이름
                    </span>

                    <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600">
                      {jar?.name}
                    </span>
                  </div>

                  <form
                    onSubmit={(e) => e.preventDefault()}
                    className={`mb-5 rounded-[24px] border p-4 ${palette.panelSoft}`}
                  >
                    <div className="grid gap-3">
                      <input
                        type="text"
                        value={searchForm.q}
                        onChange={(e) =>
                          setSearchForm((prev) => ({
                            ...prev,
                            q: e.target.value,
                          }))
                        }
                        placeholder="제목이나 내용으로 찾아보기"
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                      />

                      <input
                        type="text"
                        value={searchForm.tag}
                        onChange={(e) =>
                          setSearchForm((prev) => ({
                            ...prev,
                            tag: e.target.value,
                          }))
                        }
                        placeholder="태그로 찾아보기"
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                      />

                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className={`rounded-2xl px-4 py-2 text-sm font-bold transition hover:scale-[1.01] ${palette.primaryButton}`}
                        >
                          검색
                        </button>

                        <button
                          type="button"
                          onClick={handleResetSearch}
                          className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
                        >
                          초기화
                        </button>
                      </div>
                    </div>
                  </form>

                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500">
                      검색 결과 {filteredNotes.length}개
                    </p>

                    {filteredNotes.length !== safeNotes.length && (
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}
                      >
                        필터 적용됨
                      </span>
                    )}
                  </div>
                </div>

                {/* 쪽지 카드 목록만 따로 스크롤되는 영역 */}
                <div className="jar-zoom-note-list-scroll mt-1 h-[300px] overflow-y-auto overscroll-contain pr-2 lg:h-[330px] xl:h-[360px]">
                  {loading && (
                    <div className="space-y-3">
                      {[1, 2, 3].map((item) => (
                        <div
                          key={item}
                          className={`animate-pulse rounded-2xl border p-4 ${palette.softCard}`}
                        >
                          <div className="mb-2 h-4 w-24 rounded-full bg-slate-200" />
                          <div className="h-3 w-full rounded-full bg-slate-100" />
                        </div>
                      ))}
                    </div>
                  )}

                  {!loading && !error && filteredNotes.length === 0 && (
                    <div
                      className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}
                    >
                      아직 들어간 쪽지가 없어요.
                    </div>
                  )}

                  {!loading && !error && filteredNotes.length > 0 && (
                    <div className="space-y-3">
                      {pagedNotes.map((note, index) => (
                        <article
                          key={
                            note.noteId ??
                            note.id ??
                            `${index}-${note.title || "note"}`
                          }
                          onClick={() =>
                            onOpenNoteDetail?.(note.noteId ?? note.id)
                          }
                          className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${palette.softCard}`}
                        >
                          {/* 날짜 + 장소 */}
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.activeChip}`}
                            >
                              {note?.noteDate || "날짜 없음"}
                            </span>

                            {note?.location && (
                              <span
                                className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}
                              >
                                {note.location}
                              </span>
                            )}
                          </div>

                          {/* 제목 */}
                          <p className="text-sm font-black text-slate-800">
                            {note?.title || "오픈 전 쪽지"}
                          </p>

                          <ReactionBar
                            note={note}
                            palette={palette}
                            disabled={!jar?.isOpen}
                            loading={
                              reactingNoteId === (note.noteId ?? note.id)
                            }
                            onReact={(emoji) =>
                              onReactNote?.(note.noteId ?? note.id, emoji)
                            }
                          />

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}
                            >
                              💬 댓글 {note?.commentCount ?? 0}
                            </span>
                          </div>

                          {Array.isArray(note.attachments) &&
                            note.attachments.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {note.attachments
                                  .slice(0, 3)
                                  .map((attachment, index) => (
                                    <span
                                      key={`${attachment.s3Key}-${index}`}
                                      className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600"
                                    >
                                      첨부 {index + 1}
                                    </span>
                                  ))}

                                {note.attachments.length > 3 && (
                                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                    +{note.attachments.length - 3}
                                  </span>
                                )}
                              </div>
                            )}

                          <p className="mt-3 text-[11px] font-semibold text-slate-400">
                            눌러서 상세 보기
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {!loading &&
                  !error &&
                  filteredNotes.length > 0 &&
                  notePageCount > 1 && (
                    <div className="mt-4 shrink-0 border-t border-white/60 pt-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-semibold text-slate-500">
                          {notePage} / {notePageCount} 페이지
                        </p>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setNotePage((prev) => Math.max(1, prev - 1))
                            }
                            disabled={notePage === 1}
                            className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineBtn}`}
                          >
                            이전
                          </button>

                          {Array.from(
                            { length: notePageCount },
                            (_, index) => index + 1
                          ).map((pageNumber) => (
                            <button
                              key={pageNumber}
                              type="button"
                              onClick={() => setNotePage(pageNumber)}
                              className={`rounded-2xl px-3 py-2 text-sm font-bold transition ${
                                pageNumber === notePage
                                  ? palette.primaryButton
                                  : palette.outlineButton
                              }`}
                            >
                              {pageNumber}
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() =>
                              setNotePage((prev) =>
                                Math.min(notePageCount, prev + 1)
                              )
                            }
                            disabled={notePage === notePageCount}
                            className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineBtn}`}
                          >
                            다음
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}