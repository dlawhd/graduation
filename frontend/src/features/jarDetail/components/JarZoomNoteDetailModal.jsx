import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactionBar from "./ReactionBar";
import CommentSection from "./CommentSection";
import {
  formatDate,
  formatNoteDateOnly,
} from "../utils/jarDetailDateUtils";
import {
  getTotalCommentCount,
  normalizeJarZoomTags,
  toSafeNoteText,
} from "../utils/jarDetailUtils";
/*
 * 쪽지 첨부를 모바일 스와이프 슬라이드로 보여주는
 * 공통 첨부 컴포넌트야.
 */
import NoteAttachmentCarousel from "../../note/components/NoteAttachmentCarousel";

/*
 * JarZoomNoteDetailModal 역할
 *
 * 저금통 확대 보기에서 쪽지 하나를 눌렀을 때
 * 쪽지 상세 내용을 모달로 보여주는 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 쪽지 제목/내용/날짜/장소/태그를 보여주고
 * - 첨부 이미지나 영상을 보여주고
 * - 이미지를 클릭하면 크게 확대해서 볼 수 있고
 * - 리액션과 댓글 영역도 함께 보여준다.
 */
export default function JarZoomNoteDetailModal({
  open,
  note,
  loading,
  error,
  jar,
  palette,
  onClose,
  onRetry,
  onReact,
  reacting,
  comments,
  commentsLoading,
  commentsError,
  currentUserId,
  commentDraft,
  onCommentDraftChange,
  onCreateComment,
  commentSubmitting,
  editingCommentId,
  editingContent,
  onStartEditComment,
  onEditCommentChange,
  onCancelEditComment,
  onUpdateComment,
  deletingCommentId,
  onDeleteComment,
  replyTargetCommentId,
  replyDraftMap,
  onToggleReply,
  onReplyDraftChange,
  onCreateReply,
  replyExpandedMap,
  onToggleReplies,
  focusedCommentId,
}) {
  const tags = normalizeJarZoomTags(note?.tags);
  const hasContent = toSafeNoteText(note?.content).length > 0;

  // 첨부 이미지 확대 보기 상태
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [zoom, setZoom] = useState(1);

  /*
   * 확대 이미지 DOM을 직접 잡기 위한 ref야.
   *
   * 이유:
   * React의 onWheel에서 preventDefault를 쓰면
   * 브라우저가 passive listener 경고를 띄울 수 있어.
   *
   * 그래서 wheel 이벤트만 직접 passive: false로 등록해서
   * 이미지 확대/축소 중 페이지 스크롤을 막아준다.
   */
  const zoomImageRef = useRef(null);

  const images = note?.attachments || [];
  const currentImage = selectedIndex !== null ? images[selectedIndex] : null;

  // 확대 이미지 드래그 이동 상태
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 });
  /*
   * 모바일 확대 화면에서
   * 손가락 스와이프 시작 위치를 기억한다.
   */
  const [swipeStart, setSwipeStart] =
    useState(null);

  function handleDragStart(e) {
    if (zoom <= 1) return;

    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setLastPosition(position);
  }

  function handleDragMove(e) {
    if (!dragging) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    setPosition({
      x: lastPosition.x + deltaX,
      y: lastPosition.y + deltaY,
    });
  }

  function handleDragEnd() {
    setDragging(false);
  }

  /*
   * 확대 화면에서 모바일 손가락을 처음 댔을 때 실행된다.
   *
   * x, y 좌표를 기억해 두었다가
   * 손가락을 뗐을 때 얼마나 움직였는지 계산한다.
   */
  function handleSwipeStart(event) {
    /*
     * 사진을 확대해서 이동 중일 때는
     * 사진 넘기기와 충돌할 수 있으므로
     * zoom이 1일 때만 스와이프를 허용한다.
     */
    if (zoom > 1) {
      return;
    }

    const touch =
      event.touches?.[0];

    if (!touch) {
      return;
    }

    setSwipeStart({
      x: touch.clientX,
      y: touch.clientY,
    });
  }

  /*
   * 손가락을 뗐을 때
   * 좌우 이동 거리를 계산해서 이전/다음 사진으로 이동한다.
   */
  function handleSwipeEnd(event) {
    if (!swipeStart || zoom > 1) {
      setSwipeStart(null);
      return;
    }

    const touch =
      event.changedTouches?.[0];

    if (!touch) {
      setSwipeStart(null);
      return;
    }

    const deltaX =
      touch.clientX -
      swipeStart.x;

    const deltaY =
      touch.clientY -
      swipeStart.y;

    setSwipeStart(null);

    /*
     * 세로 스크롤을 좌우 스와이프로
     * 잘못 판단하지 않게 한다.
     *
     * 좌우 움직임이 세로 움직임보다 커야 한다.
     */
    if (
      Math.abs(deltaX) <=
      Math.abs(deltaY)
    ) {
      return;
    }

    /*
     * 너무 작은 움직임은 그냥 터치로 본다.
     */
    const SWIPE_DISTANCE = 50;

    if (
      Math.abs(deltaX) <
      SWIPE_DISTANCE
    ) {
      return;
    }

    /*
     * 왼쪽으로 밀었다.
     * → 다음 사진
     */
    if (
      deltaX < 0 &&
      selectedIndex <
        images.length - 1
    ) {
      setSelectedIndex(
        (prev) => prev + 1
      );

      setZoom(1);
      setPosition({
        x: 0,
        y: 0,
      });

      return;
    }

    /*
     * 오른쪽으로 밀었다.
     * → 이전 사진
     */
    if (
      deltaX > 0 &&
      selectedIndex > 0
    ) {
      setSelectedIndex(
        (prev) => prev - 1
      );

      setZoom(1);
      setPosition({
        x: 0,
        y: 0,
      });
    }
  }

  /*
   * 확대 이미지에서 마우스 휠을 굴리면
   * 이미지 확대/축소를 처리한다.
   *
   * 중요:
   * addEventListener의 passive: false 옵션을 줘야
   * e.preventDefault()로 페이지 스크롤을 막을 수 있다.
   */
  useEffect(() => {
    if (!currentImage) return;

    const imageElement = zoomImageRef.current;

    if (!imageElement) return;

    function handleWheel(e) {
      e.preventDefault();

      const delta = e.deltaY > 0 ? -0.1 : 0.1;

      setZoom((z) => {
        const nextZoom = Math.max(0.5, Math.min(3, z + delta));

        // 다시 1 이하로 줄어들면 위치를 원위치로 돌려준다.
        if (nextZoom <= 1) {
          setPosition({ x: 0, y: 0 });
        }

        return nextZoom;
      });
    }

    imageElement.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    return () => {
      imageElement.removeEventListener("wheel", handleWheel, {
        passive: false,
      });
    };
  }, [currentImage]);

  /*
   * 이미지가 확대된 상태에서 마우스를 움직이면
   * 이미지 위치를 같이 움직이게 해준다.
   */
  useEffect(() => {
    if (!dragging) return;

    function onMouseMove(e) {
      handleDragMove(e);
    }

    function onMouseUp() {
      handleDragEnd();
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, dragStart, lastPosition]);

  /*
   * 확대 이미지 보기에서 키보드 조작을 지원한다.
   *
   * - Escape: 확대 이미지 닫기
   * - ArrowRight: 다음 이미지
   * - ArrowLeft: 이전 이미지
   */
  useEffect(() => {
    const handler = (e) => {
      if (selectedIndex === null) return;

      if (e.key === "Escape") {
        setSelectedIndex(null);
      }

      if (e.key === "ArrowRight") {
        setSelectedIndex((prev) =>
          prev < images.length - 1 ? prev + 1 : prev
        );
      }

      if (e.key === "ArrowLeft") {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIndex, images.length]);

  // Hook 선언이 끝난 뒤에 open 체크를 해야 한다.
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9994] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/60 px-4 py-4 sm:py-6">
      <style>
        {`
          .jar-note-detail-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
          }

          .jar-note-detail-scroll::-webkit-scrollbar {
            width: 8px;
          }

          .jar-note-detail-scroll::-webkit-scrollbar-track {
            background: transparent;
            margin: 16px 0;
          }

          .jar-note-detail-scroll::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.45);
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.95);
          }

          .jar-note-detail-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 116, 139, 0.65);
          }
        `}
      </style>

      <div className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)] sm:max-h-[calc(100dvh-3rem)]">
        <div className="shrink-0 border-b border-slate-100/80 bg-white/95 px-6 pb-4 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-black text-slate-800">
                쪽지 상세 보기
              </p>
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
        </div>

        <div className="jar-note-detail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5">
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
            <div
              className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}
            >
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
                {note.noteDate && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}
                  >
                    {formatNoteDateOnly(note.noteDate)}
                  </span>
                )}

                {toSafeNoteText(note.location) && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}
                  >
                    {note.location}
                  </span>
                )}

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}
                >
                  댓글 {note?.commentCount ?? getTotalCommentCount(comments)}개
                </span>
              </div>

              <div>
                <h3 className="text-2xl font-black text-slate-800">
                  {toSafeNoteText(note.title) || "제목 없는 추억"}
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  작성 시간: {formatDate(note.createdAt)}
                </p>
              </div>

              <div className={`rounded-[28px] border p-5 ${palette.panel}`}>
                {Array.isArray(note?.attachments) &&
                  note.attachments.length > 0 && (
                    <div className="mt-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                          첨부 파일
                        </p>

                        {note.attachments.length >
                          1 && (
                          <span className="text-[11px] font-medium text-slate-400">
                            좌우로 넘겨보세요
                          </span>
                        )}
                      </div>

                      <NoteAttachmentCarousel
                        attachments={
                          note.attachments
                        }
                        /*
                         * 슬라이드 안의 사진을 누르면
                         * 기존 확대 화면을 그대로 사용한다.
                         */
                        onImageClick={(
                          attachment,
                          index
                        ) => {
                          setSelectedIndex(index);

                          // 다른 사진에서 사용했던 확대 배율을 초기화
                          setZoom(1);

                          // 이전 사진의 이동 위치도 초기화
                          setPosition({
                            x: 0,
                            y: 0,
                          });
                        }}
                      />
                    </div>
                  )}

                <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  내용
                </p>

                <div
                  className={`rounded-2xl border px-4 py-4 text-sm leading-7 text-slate-700 ${palette.infoBox}`}
                >
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

              <CommentSection
                palette={palette}
                comments={comments}
                loading={commentsLoading}
                error={commentsError}
                currentUserId={currentUserId}
                draft={commentDraft}
                onDraftChange={onCommentDraftChange}
                onCreate={onCreateComment}
                submitting={commentSubmitting}
                editingCommentId={editingCommentId}
                editingContent={editingContent}
                onStartEdit={onStartEditComment}
                onEditChange={onEditCommentChange}
                onCancelEdit={onCancelEditComment}
                onUpdate={onUpdateComment}
                deletingCommentId={deletingCommentId}
                onDelete={onDeleteComment}
                replyTargetCommentId={replyTargetCommentId}
                replyDraftMap={replyDraftMap}
                onToggleReply={onToggleReply}
                onReplyDraftChange={onReplyDraftChange}
                onCreateReply={onCreateReply}
                replyExpandedMap={replyExpandedMap}
                onToggleReplies={onToggleReplies}
                focusedCommentId={focusedCommentId}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className={`rounded-2xl border px-4 py-4 ${palette.infoBox}`}
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    추억 날짜
                  </p>
                  <p className="text-sm font-semibold text-slate-700">
                    {formatNoteDateOnly(note.noteDate)}
                  </p>
                </div>

                <div
                  className={`rounded-2xl border px-4 py-4 ${palette.infoBox}`}
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    장소
                  </p>
                  <p className="text-sm font-semibold text-slate-700">
                    {toSafeNoteText(note.location) || "-"}
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

      {currentImage && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80"
          onClick={() =>
            setSelectedIndex(null)
          }

          /*
           * 모바일에서 검은 확대 화면을 좌우로 밀면
           * 이전/다음 첨부로 이동한다.
           */
          onTouchStart={
            handleSwipeStart
          }
          onTouchEnd={
            handleSwipeEnd
          }
        >
        {/* 현재 보고 있는 첨부 순서 */}
        {images.length > 1 && (
          <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-black text-white backdrop-blur-sm">
            {selectedIndex + 1} /{" "}
            {images.length}
          </div>
        )}
          {selectedIndex > 0 && (
            <button
              type="button"
              className="absolute left-6 text-3xl text-white"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndex((prev) => prev - 1);
                setZoom(1);
                setPosition({ x: 0, y: 0 });
              }}
            >
              ←
            </button>
          )}

          {currentImage.contentType?.startsWith("image/") ? (
            <img
              ref={zoomImageRef}
              src={currentImage.url}
              alt="확대 이미지"
              className={`max-h-[80vh] max-w-[90vw] rounded-2xl shadow-lg transition ${
                dragging
                  ? "cursor-grabbing"
                  : zoom > 1
                    ? "cursor-grab"
                    : "cursor-default"
              }`}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                transition: dragging ? "none" : "transform 0.15s ease-out",
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleDragStart(e);
              }}
            />
          ) : currentImage.contentType?.startsWith("video/") ? (
            <video
              src={currentImage.url}
              controls
              autoPlay
              className="max-h-[80vh] max-w-[90vw] rounded-2xl bg-black shadow-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="rounded-2xl bg-white px-6 py-4 text-sm text-slate-700"
              onClick={(e) => e.stopPropagation()}
            >
              미리보기를 지원하지 않는 파일이에요.
            </div>
          )}

          {/* 확대해서 보는 동안에도 사진의 추억 설명을 같이 보여준다. */}
          {toSafeNoteText(currentImage.caption) && (
            <div
              className="
                absolute bottom-6 left-1/2
                w-[calc(100%-2rem)] max-w-xl
                -translate-x-1/2
                rounded-2xl
                bg-black/65
                px-4 py-3
                text-center
                backdrop-blur-sm
              "
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <p className="text-xs font-bold text-white/60">
                추억 설명
              </p>

              <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-6 text-white">
                {currentImage.caption}
              </p>
            </div>
          )}

          {selectedIndex < images.length - 1 && (
            <button
              type="button"
              className="absolute right-6 text-3xl text-white"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndex((prev) => prev + 1);
                setZoom(1);
                setPosition({ x: 0, y: 0 });
              }}
            >
              →
            </button>
          )}

          <button
            type="button"
            className="absolute right-6 top-6 text-xl text-white"
            onClick={() => setSelectedIndex(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}