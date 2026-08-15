import {
  useEffect,
  useRef,
  useState,
} from "react";

/*
 * NoteAttachmentCarousel 역할
 *
 * 저장된 쪽지 첨부파일 또는
 * 쪽지 작성 미리보기의 첨부파일을
 * 한 장씩 슬라이드 형태로 보여주는 컴포넌트야.
 *
 * 주요 기능:
 *
 * 1. 모바일에서 손가락으로 좌우 스와이프
 * 2. PC에서 좌우 버튼으로 이동
 * 3. 현재 몇 번째 첨부인지 표시
 * 4. 사진/영상 아래에 추억 설명(caption) 표시
 * 5. 하단 점(dot)을 눌러 원하는 첨부로 이동
 *
 * 쉽게 말하면:
 *
 * 사진 여러 장을 세로로 길게 나열하는 대신
 * 사진첩처럼 한 장씩 넘겨볼 수 있게 만들어주는 역할이야.
 */
export default function NoteAttachmentCarousel({
  attachments = [],

  /*
   * 사진을 눌렀을 때 실행할 함수.
   *
   * JarZoomNoteDetailModal에서는
   * 이 함수를 전달해서 확대 화면을 열 수 있다.
   *
   * 작성 미리보기에서는 전달하지 않아도 된다.
   */
  onImageClick,

  /*
   * caption을 작성하지 않은 경우에도
   * "추억 설명 없음" 문구를 보여줄지 결정한다.
   *
   * 작성 미리보기에서는 true,
   * 저장된 쪽지 상세에서는 false를 추천한다.
   */
  showEmptyCaption = false,
}) {
  // 현재 화면에 가장 가까운 첨부 번호
  const [currentIndex, setCurrentIndex] =
    useState(0);

  /*
   * 가로 슬라이드 DOM을 기억한다.
   *
   * 좌우 버튼을 눌렀을 때
   * 원하는 위치로 부드럽게 이동하기 위해 사용한다.
   */
  const carouselRef = useRef(null);

  const attachmentCount =
    Array.isArray(attachments)
      ? attachments.length
      : 0;

  /*
   * 첨부 개수가 달라지면
   * 슬라이드를 첫 번째 사진으로 되돌린다.
   *
   * 예:
   *
   * 사진 3장을 보고 있다가
   * 다른 쪽지를 열었는데 사진이 1장뿐이라면
   * 이전의 3번째 위치가 남으면 안 된다.
   */
  useEffect(() => {
    setCurrentIndex(0);

    const carousel =
      carouselRef.current;

    if (!carousel) {
      return;
    }

    carousel.scrollTo({
      left: 0,
      behavior: "auto",
    });
  }, [attachmentCount]);

  /*
   * caption 값을 화면에 안전하게 표시한다.
   */
  function getSafeCaption(value) {
    return typeof value === "string"
      ? value.trim()
      : "";
  }

  /*
   * 원하는 첨부 번호로 이동한다.
   *
   * 예:
   * 0 → 첫 번째 사진
   * 1 → 두 번째 사진
   * 2 → 세 번째 사진
   */
  function moveToIndex(nextIndex) {
    const carousel =
      carouselRef.current;

    if (!carousel) {
      return;
    }

    // 배열 바깥으로 나가지 않도록 막는다.
    const safeIndex = Math.max(
      0,
      Math.min(
        nextIndex,
        attachmentCount - 1
      )
    );

    /*
     * 실제 safeIndex번째 슬라이드의
     * 왼쪽 위치를 찾는다.
     *
     * 단순히 화면 너비를 곱하는 것보다
     * 실제 DOM 위치를 이용하는 편이 안전하다.
     */
    const targetSlide =
      carousel.children?.[safeIndex];

    if (!targetSlide) {
      return;
    }

    carousel.scrollTo({
      left: targetSlide.offsetLeft,
      behavior: "smooth",
    });

    setCurrentIndex(safeIndex);
  }

  /*
   * 사용자가 모바일에서 직접 스와이프했을 때
   * 현재 몇 번째 사진인지 계산한다.
   */
  function handleScroll(event) {
    const carousel =
      event.currentTarget;

    const slideWidth =
      carousel.clientWidth;

    if (!slideWidth) {
      return;
    }

    const nextIndex = Math.round(
      carousel.scrollLeft /
        slideWidth
    );

    const safeIndex = Math.max(
      0,
      Math.min(
        nextIndex,
        attachmentCount - 1
      )
    );

    setCurrentIndex(safeIndex);
  }

  /*
   * 첨부파일이 없으면 아무것도 만들지 않는다.
   */
  if (attachmentCount === 0) {
    return null;
  }

  return (
    <div className="w-full">
      {/* 상단 현재 위치 + 모바일 안내 */}
      <div className="mb-3 flex items-center justify-between gap-3">
        {attachmentCount > 1 ? (
          <p className="text-xs font-medium text-slate-400">
            좌우로 넘겨서 추억을 확인해 보세요.
          </p>
        ) : (
          <span />
        )}

        <span className="shrink-0 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-black text-white">
          {currentIndex + 1} /{" "}
          {attachmentCount}
        </span>
      </div>

      {/* 슬라이드 전체 영역 */}
      <div className="relative">
        {/*
         * 핵심 부분.
         *
         * overflow-x-auto:
         * → 가로 스크롤 가능
         *
         * snap-x + snap-mandatory:
         * → 손가락을 놓으면 사진 한 장 위치에 딱 맞춰진다.
         *
         * 즉 별도 슬라이더 라이브러리가 없어도
         * 모바일의 자연스러운 스와이프를 사용할 수 있다.
         */}
        <div
          ref={carouselRef}
          onScroll={handleScroll}
          className="
            flex w-full
            snap-x snap-mandatory
            overflow-x-auto
            scroll-smooth
            overscroll-x-contain
            rounded-2xl
            bg-slate-50
            [&::-webkit-scrollbar]:hidden
          "
          style={{
            scrollbarWidth: "none",
          }}
          tabIndex={0}
          onKeyDown={(event) => {
            /*
             * PC 키보드에서도
             * ← / → 키로 사진을 넘길 수 있게 한다.
             */
            if (
              event.key === "ArrowLeft"
            ) {
              event.preventDefault();

              moveToIndex(
                currentIndex - 1
              );
            }

            if (
              event.key === "ArrowRight"
            ) {
              event.preventDefault();

              moveToIndex(
                currentIndex + 1
              );
            }
          }}
          aria-label="첨부 사진과 영상 슬라이드"
        >
          {attachments.map(
            (attachment, index) => {
              const isImage =
                attachment.contentType?.startsWith(
                  "image/"
                );

              const isVideo =
                attachment.contentType?.startsWith(
                  "video/"
                );

              /*
               * 작성 중이면 previewUrl을 가장 먼저 사용하고,
               * 저장된 쪽지는 thumbnailUrl 또는 url을 사용한다.
               */
              const previewSource =
                attachment.previewUrl ||
                attachment.thumbnailUrl ||
                attachment.url;

              const caption =
                getSafeCaption(
                  attachment.caption
                );

              return (
                <article
                  key={
                    attachment.clientId ||
                    attachment.attachmentId ||
                    attachment.s3Key ||
                    index
                  }
                  className="
                    w-full shrink-0
                    snap-center
                    overflow-hidden
                    rounded-2xl
                    border border-slate-200
                    bg-white
                  "
                >
                  {/* 사진/영상 영역 */}
                  <div className="relative flex h-60 items-center justify-center bg-slate-100 sm:h-80">
                    {isImage ? (
                      onImageClick ? (
                        /*
                         * 확대 기능이 있는 화면에서는
                         * 사진 전체를 버튼처럼 사용할 수 있다.
                         */
                        <button
                          type="button"
                          onClick={() =>
                            onImageClick(
                              attachment,
                              index
                            )
                          }
                          className="h-full w-full"
                          aria-label={`${
                            index + 1
                          }번째 사진 크게 보기`}
                        >
                          <img
                            src={
                              previewSource
                            }
                            alt={`${
                              index + 1
                            }번째 첨부 이미지`}
                            draggable={false}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : (
                        <img
                          src={previewSource}
                          alt={`${
                            index + 1
                          }번째 첨부 이미지`}
                          draggable={false}
                          className="h-full w-full object-cover"
                        />
                      )
                    ) : isVideo ? (
                      <video
                        src={
                          attachment.url ||
                          previewSource
                        }
                        controls
                        playsInline
                        className="h-full w-full bg-black object-contain"
                      />
                    ) : (
                      <div className="px-5 text-center text-sm font-semibold text-slate-400">
                        미리보기를 지원하지
                        않는 파일이에요.
                      </div>
                    )}
                  </div>

                  {/* 추억 설명 */}
                  {caption ? (
                    <div className="border-t border-slate-100 px-4 py-4">
                      <p className="text-xs font-bold text-slate-400">
                        추억 설명
                      </p>

                      <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-600">
                        {caption}
                      </p>
                    </div>
                  ) : showEmptyCaption ? (
                    <div className="border-t border-slate-100 px-4 py-3">
                      <p className="text-xs font-medium text-slate-400">
                        따로 적어둔 추억
                        설명은 없어요.
                      </p>
                    </div>
                  ) : null}
                </article>
              );
            }
          )}
        </div>

        {/*
         * PC에서 쓰기 편한 좌우 버튼.
         *
         * 모바일에서는 굳이 누르지 않아도
         * 손가락 스와이프가 가능하다.
         */}
        {attachmentCount > 1 &&
          currentIndex > 0 && (
            <button
              type="button"
              onClick={() =>
                moveToIndex(
                  currentIndex - 1
                )
              }
              className="
                absolute left-3 top-1/2
                hidden h-10 w-10
                -translate-y-1/2
                items-center justify-center
                rounded-full
                bg-black/55
                text-xl font-black text-white
                shadow-lg backdrop-blur-sm
                transition hover:bg-black/70
                sm:flex
              "
              aria-label="이전 첨부 보기"
            >
              ‹
            </button>
          )}

        {attachmentCount > 1 &&
          currentIndex <
            attachmentCount - 1 && (
            <button
              type="button"
              onClick={() =>
                moveToIndex(
                  currentIndex + 1
                )
              }
              className="
                absolute right-3 top-1/2
                hidden h-10 w-10
                -translate-y-1/2
                items-center justify-center
                rounded-full
                bg-black/55
                text-xl font-black text-white
                shadow-lg backdrop-blur-sm
                transition hover:bg-black/70
                sm:flex
              "
              aria-label="다음 첨부 보기"
            >
              ›
            </button>
          )}
      </div>

      {/* 하단 위치 점 */}
      {attachmentCount > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {attachments.map(
            (attachment, index) => {
              const isActive =
                index === currentIndex;

              return (
                <button
                  key={
                    attachment.clientId ||
                    attachment.attachmentId ||
                    attachment.s3Key ||
                    index
                  }
                  type="button"
                  onClick={() =>
                    moveToIndex(index)
                  }
                  className={`h-2.5 rounded-full transition-all ${
                    isActive
                      ? "w-6 bg-slate-700"
                      : "w-2.5 bg-slate-300 hover:bg-slate-400"
                  }`}
                  aria-label={`${
                    index + 1
                  }번째 첨부 보기`}
                />
              );
            }
          )}
        </div>
      )}
    </div>
  );
}