import { useRef } from "react";
/*
 * dnd-kit 역할
 *
 * PC에서는 마우스로, 모바일에서는 손가락으로 첨부 카드의 순서를 바꿀 수 있게 도와주는 라이브러리
 */
import { DragDropProvider } from "@dnd-kit/react";
import {
  isSortable,
  useSortable,
} from "@dnd-kit/react/sortable";
import {
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
/*
 * NoteAttachmentPicker 역할
 *
 * 새 쪽지를 작성할 때 사진과 영상을 선택하고,
 * 현재 첨부 개수와 남은 개수를 보여주며,
 * 사용자가 첨부 순서를 직접 바꿀 수 있게 도와주는 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 파일 선택
 * - 최대 10개 제한 안내
 * - 선택된 파일 미리보기
 * - 드래그 또는 버튼으로 순서 변경
 * - 필요 없는 파일 삭제
 * 를 한곳에서 담당해.
 */

// 프론트에서 사용하는 최대 첨부파일 개수다.
export const NOTE_ATTACHMENT_LIMIT = 10;

/*
 * 새 쪽지 첨부파일 용량 제한
 *
 * 백엔드 application.yml / S3PresignService와
 * 같은 기준으로 맞춘다.
 *
 * 사진:
 * 10 * 1024 * 1024 = 10MB
 *
 * 영상:
 * 30 * 1024 * 1024 = 30MB
 *
 * 프론트에서 먼저 검사하는 이유:
 * 용량을 초과한 파일을 굳이 백엔드와 S3까지
 * 보내지 않고 파일 선택 즉시 알려주기 위해서야.
 */
export const NOTE_IMAGE_MAX_SIZE =
  10 * 1024 * 1024;

export const NOTE_VIDEO_MAX_SIZE =
  30 * 1024 * 1024;

/*
 * 첨부 순서 변경용 PointerSensor 설정
 *
 * PC:
 * - 마우스를 6px 이상 움직였을 때 드래그 시작
 * - 그냥 클릭한 것을 드래그로 착각하지 않게 해준다.
 *
 * 모바일:
 * - 약 250ms 동안 꾹 누른 뒤 드래그 시작
 * - 손가락이 8px 정도 흔들리는 것은 허용한다.
 *
 * 쉽게 말하면:
 * PC = 잡고 이동
 * 모바일 = 살짝 꾹 누른 뒤 이동
 */
const NOTE_ATTACHMENT_POINTER_SENSOR =
  PointerSensor.configure({
    activationConstraints(event) {
      // 휴대폰/태블릿 터치
      if (event.pointerType === "touch") {
        return [
          new PointerActivationConstraints.Delay({
            value: 250,
            tolerance: 8,
          }),
        ];
      }

      // PC 마우스 또는 펜
      return [
        new PointerActivationConstraints.Distance({
          value: 6,
        }),
      ];
    },
  });

// 사진/영상 하나에 적을 수 있는 추억 설명의 최대 글자 수야.
// 백엔드의 caption 최대 길이와 똑같이 200자로 맞춘다.
export const NOTE_ATTACHMENT_CAPTION_LIMIT = 200;

// 백엔드에서 허용하는 이미지와 영상 형식을 파일 선택창에도 지정한다.
const NOTE_ATTACHMENT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
].join(",");

/*
 * 첨부파일 화면 표시 이름을 만드는 함수
 *
 * 업로드 직후에는 원본 파일명인 fileName을 보여주고,
 * fileName이 없는 기존 데이터는 s3Key 마지막 부분을 대신 보여준다.
 */
export function getAttachmentDisplayName(attachment, index = 0) {
  if (attachment?.fileName) {
    return attachment.fileName;
  }

  if (attachment?.s3Key) {
    const pathParts = String(attachment.s3Key).split("/");

    return pathParts[pathParts.length - 1] || `첨부 ${index + 1}`;
  }

  return `첨부 ${index + 1}`;
}

/*
 * SortableAttachmentCard 역할
 *
 * 사진/영상 첨부 카드 한 장을 담당하는 컴포넌트야.
 *
 * 하는 일:
 * - dnd-kit에 "나는 몇 번째 카드야"라고 알려주기
 * - PC 마우스 드래그 지원
 * - 모바일 길게 누른 뒤 드래그 지원
 * - 사진/영상 미리보기
 * - 추억 설명 입력
 * - 앞으로/뒤로 이동
 * - 삭제
 *
 * 중요:
 * 실제 첨부 배열을 여기서 직접 바꾸지는 않는다.
 *
 * 드래그가 끝나면 부모 NoteAttachmentPicker가
 * 기존 onMoveAttachment 함수를 호출해서
 * NoteSection의 writeForm.attachments 순서를 변경한다.
 */
function SortableAttachmentCard({
  attachment,
  index,
  attachmentCount,
  palette,
  isDisabled,
  onRemoveAttachment,
  onMoveAttachment,
  onChangeAttachmentCaption,
}) {
  /*
   * 각 첨부파일을 구분하는 고유 ID.
   *
   * 새 파일을 올릴 때 NoteSection에서 clientId를 만들어주고 있고,
   * 업로드가 끝난 파일에는 s3Key도 있으므로 둘 중 하나를 사용한다.
   */
  const sortableId =
    attachment.clientId ||
    attachment.s3Key;

  /*
   * useSortable이 이 카드를
   * "움직일 수도 있고 다른 카드의 도착점도 될 수 있는 카드"
   * 로 만들어준다.
   */
  const {
    // 카드 전체 위치와 drop 영역을 연결한다.
    ref,

    // 실제로 사용자가 잡고 움직일 영역을 연결한다.
    // 이번에는 사진/영상 미리보기 영역을 드래그 손잡이로 사용한다.
    handleRef,

    isDragging,
    isDropTarget,
  } = useSortable({
    id: sortableId,
    index,

    // 업로드/저장 중에는 순서를 바꾸지 못하게 한다.
    disabled: isDisabled,

    // 카드가 새로운 순서로 이동할 때 부드럽게 움직인다.
    transition: {
      duration: 180,
      easing: "ease",
      idle: true,
    },
  });

  const isImage =
    attachment.contentType?.startsWith(
      "image/"
    );

  const isVideo =
    attachment.contentType?.startsWith(
      "video/"
    );

  const displayName =
    getAttachmentDisplayName(
      attachment,
      index
    );

  const previewSource =
    attachment.previewUrl ||
    attachment.thumbnailUrl ||
    attachment.url;

  return (
    <article
      /*
       * dnd-kit가 이 실제 DOM 카드를 찾을 수 있도록
       * ref를 연결한다.
       */
      ref={ref}
      className={`
        relative overflow-hidden
        rounded-2xl border bg-white/80
        shadow-sm transition
        ${
          isDragging
            ? "z-20 scale-[1.02] border-emerald-300 shadow-xl"
            : "border-slate-200 hover:-translate-y-0.5 hover:shadow-md"
        }
        ${
          isDropTarget && !isDragging
            ? "ring-2 ring-emerald-200"
            : ""
        }
      `}
    >
      {/*
       * 이미지/영상 미리보기 영역
       *
       * 이 영역을 dnd-kit의 drag handle로 사용한다.
       *
       * PC:
       * - 사진을 잡고 움직이면 순서 변경
       *
       * 모바일:
       * - 사진을 잠깐 꾹 누른 뒤 움직이면 순서 변경
       *
       * 아래의 textarea와 버튼은 드래그 영역에서 제외되므로
       * 설명 작성이나 버튼 클릭이 더 안정적이다.
       */}
      <div
        ref={handleRef}
        className={`
          relative flex h-44 items-center justify-center bg-slate-50
          ${
            isDisabled
              ? "cursor-default"
              : "cursor-grab active:cursor-grabbing"
          }
        `}
      >
        {/* 현재 순서 */}
        <span className="absolute left-3 top-3 z-10 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-black text-white shadow-sm">
          {index + 1}번째
        </span>

        {/*
         * 사용법 안내
         *
         * 카드의 일반 영역을:
         * - PC에서는 드래그
         * - 모바일에서는 약 0.25초 꾹 누른 뒤 이동
         *
         * textarea / 버튼처럼 클릭하는 요소에서는
         * 기본적으로 드래그가 시작되지 않아서
         * 추억 설명 작성이나 버튼 클릭을 방해하지 않는다.
         */}
        {!isDisabled &&
          attachmentCount > 1 && (
            <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-500 shadow-sm backdrop-blur-sm">
              꾹 눌러 이동
            </span>
          )}

        {isImage ? (
          <img
            src={previewSource}
            alt={`${index + 1}번째 첨부 ${displayName}`}

            // 브라우저 자체 이미지 드래그 기능은 끈다.
            // 카드 순서 변경은 dnd-kit만 담당하게 한다.
            draggable={false}

            className="h-full w-full object-cover"
          />
        ) : isVideo ? (
          <video
            src={previewSource}
            controls
            draggable={false}
            className="h-full w-full bg-black object-cover"
          />
        ) : (
          <div className="px-4 text-center text-xs font-semibold text-slate-500">
            미리보기를 지원하지 않는
            파일이에요.
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        {/* 사진/영상마다 남기는 추억 설명 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`attachment-caption-${index}`}
              className="text-xs font-bold text-slate-600"
            >
              추억 설명 (선택)
            </label>

            <span className="text-[11px] font-semibold text-slate-400">
              {(attachment.caption || "").length}/
              {NOTE_ATTACHMENT_CAPTION_LIMIT}
            </span>
          </div>

          <textarea
            id={`attachment-caption-${index}`}
            rows={3}
            value={attachment.caption || ""}
            maxLength={
              NOTE_ATTACHMENT_CAPTION_LIMIT
            }
            disabled={isDisabled}
            onChange={(event) =>
              onChangeAttachmentCaption?.(
                index,
                event.target.value
              )
            }
            placeholder="예: 이때 바람이 엄청 불어서 다 같이 웃었어."
            className={`w-full resize-none rounded-2xl border px-3 py-2.5 text-sm font-medium leading-6 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${palette.input}`}
          />

          <p className="text-[11px] leading-5 text-slate-400">
            저금통이 열린 뒤 사진이나 영상을 볼 때
            이 설명도 함께 보여요.
          </p>
        </div>

        {/* 기존 버튼 방식도 그대로 남겨둔다. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 한 칸 앞으로 이동 */}
          <button
            type="button"
            onClick={() =>
              onMoveAttachment(
                index,
                index - 1
              )
            }
            disabled={
              isDisabled ||
              index === 0
            }
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`${displayName}을 앞으로 이동`}
          >
            ← 앞으로
          </button>

          {/* 한 칸 뒤로 이동 */}
          <button
            type="button"
            onClick={() =>
              onMoveAttachment(
                index,
                index + 1
              )
            }
            disabled={
              isDisabled ||
              index ===
                attachmentCount - 1
            }
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`${displayName}을 뒤로 이동`}
          >
            뒤로 →
          </button>

          {/* 첨부파일 삭제 */}
          <button
            type="button"
            onClick={() =>
              onRemoveAttachment(index)
            }
            disabled={isDisabled}
            className="ml-auto rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            삭제
          </button>
        </div>
      </div>
    </article>
  );
}

/*
 * NoteAttachmentPicker 컴포넌트
 *
 * 부모인 NoteSection에서 첨부파일 상태와 처리 함수를 받아
 * 첨부 선택·정렬·삭제 화면을 보여준다.
 */
export default function NoteAttachmentPicker({
  attachments = [],
  palette,
  uploading,
  loading,
  uploadProgress,
  uploadError,
  onSelectFiles,
  onRemoveAttachment,
  onMoveAttachment,

  // 사진/영상마다 적는 추억 설명을 부모인 NoteSection에 전달한다.
  onChangeAttachmentCaption,
}) {
  // 현재 들어 있는 첨부파일 개수
  const attachmentCount = attachments.length;

  // 앞으로 몇 개를 더 넣을 수 있는지 계산한다.
  const remainingCount = Math.max(
    0,
    NOTE_ATTACHMENT_LIMIT - attachmentCount
  );

  // 10개를 모두 채웠는지 확인한다.
  const isLimitReached =
    attachmentCount >= NOTE_ATTACHMENT_LIMIT;

  // 업로드나 쪽지 저장 중에는 순서 변경과 삭제를 막는다.
  const isDisabled = uploading || loading;

  /*
   * dnd-kit 드래그가 끝났을 때 실행된다.
   *
   * 예:
   *
   * 처음:
   * [사진A, 사진B, 사진C]
   *
   * 사진C를 사진A 자리로 이동
   *
   * initialIndex = 2
   * index = 0
   *
   * 기존 onMoveAttachment(2, 0)을 호출해서
   * 실제 React 배열 순서도 바꿔준다.
   */
  function handleAttachmentDragEnd(event) {
    // 드래그가 취소됐으면 아무것도 하지 않는다.
    if (event.canceled) {
      return;
    }

    // 업로드 또는 저장 중이라면 순서를 건드리지 않는다.
    if (isDisabled) {
      return;
    }

    const { source } =
      event.operation;

    /*
     * 이 이벤트가 우리가 만든 sortable 카드에서 나온 것인지 확인한다.
     */
    if (!isSortable(source)) {
      return;
    }

    const fromIndex =
      source.initialIndex;

    const toIndex =
      source.index;

    // 실제 위치가 바뀌지 않았다면 끝낸다.
    if (
      fromIndex === toIndex
    ) {
      return;
    }

    /*
     * 기존 프로젝트의 순서 변경 함수를 그대로 재사용한다.
     *
     * NoteAttachmentPicker
     *      ↓
     * onMoveAttachment
     *      ↓
     * NoteSection.handleMoveAttachment
     *      ↓
     * writeForm.attachments 순서 변경
     */
    onMoveAttachment(
      fromIndex,
      toIndex
    );
  }

    // 실제 <input type="file">을 기억해두는 Ref야.
    // 화면에서는 기본 파일 선택창을 숨기고,
    // 우리가 만든 "사진/영상 추가하기" 버튼으로 이 input을 대신 눌러줄 거야.
    const fileInputRef = useRef(null);

    /*
     * 사용자가 우리가 만든 첨부 버튼을 눌렀을 때 실행돼.
     *
     * 숨겨져 있는 실제 파일 input을 클릭해서
     * PC에서는 파일 선택창,
     * 모바일에서는 사진/영상 선택 화면을 열어준다.
     */
    function handleOpenFilePicker() {
      // 파일 업로드 중이거나 쪽지를 저장 중이면 새 파일을 고르지 못하게 막는다.
      if (isDisabled) {
        return;
      }

      // 이미 10개를 모두 넣었다면 파일 선택창을 열 필요가 없다.
      if (isLimitReached) {
        return;
      }

      // 숨겨진 파일 input을 실제로 클릭한다.
      fileInputRef.current?.click();
    }

  return (
    <section
      className="space-y-3"
      aria-labelledby="note-attachment-title"
    >
      {/* 첨부파일 제목, 현재 개수, 남은 개수 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p
            id="note-attachment-title"
            className="text-xs font-semibold text-slate-500"
          >
            첨부 파일 (선택)
          </p>

          <div className="mt-1 space-y-0.5 text-xs text-slate-400">
            {/* 첨부 가능한 개수 안내 */}
            <p>
              사진과 영상을 합쳐 최대{" "}
              {NOTE_ATTACHMENT_LIMIT}개까지 넣을 수 있어요.
            </p>

            {/* 백엔드 파일 용량 정책을 사용자에게 미리 알려준다. */}
            <p>
              사진은 1개당 최대 10MB, 영상은 1개당 최대 30MB까지 가능해요.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${
              isLimitReached
                ? "bg-rose-100 text-rose-600"
                : attachmentCount > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {attachmentCount}/{NOTE_ATTACHMENT_LIMIT}
          </span>

          <span className="text-xs font-semibold text-slate-400">
            {isLimitReached
              ? "더 추가할 수 없어요"
              : `${remainingCount}개 더 가능`}
          </span>
        </div>
      </div>

            {/*
             * 실제 파일 선택 input
             *
             * 기존에는 브라우저 기본 디자인인
             * "파일 선택 / 선택된 파일 없음"이 그대로 보였어.
             *
             * 이제는 화면에서는 숨겨두고,
             * 아래의 커스텀 버튼을 눌렀을 때만 실행한다.
             *
             * 중요:
             * onChange={onSelectFiles}는 기존 그대로 유지하기 때문에
             * NoteSection의 S3 업로드 로직은 전혀 바뀌지 않는다.
             */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={NOTE_ATTACHMENT_ACCEPT}
              onChange={onSelectFiles}
              disabled={isDisabled || isLimitReached}
              className="hidden"
            />

            {/*
             * 사용자가 실제로 보게 되는 파일 선택 버튼
             *
             * 작은 브라우저 기본 버튼 대신
             * 아이콘 + 제목 + 설명이 있는 넓은 버튼으로 만들어
             * PC와 모바일 모두 쉽게 누를 수 있게 한다.
             */}
            <button
              type="button"
              onClick={handleOpenFilePicker}
              disabled={isDisabled || isLimitReached}
              className={`
                group flex w-full items-center gap-4
                rounded-2xl border px-4 py-4
                text-left outline-none transition
                hover:-translate-y-0.5 hover:shadow-sm
                focus-visible:ring-2 focus-visible:ring-emerald-200
                disabled:cursor-not-allowed
                disabled:opacity-60
                disabled:hover:translate-y-0
                disabled:hover:shadow-none
                ${palette.input}
              `}
              aria-label={
                isLimitReached
                  ? "첨부파일을 최대 개수까지 추가했어요"
                  : "사진 또는 영상 선택하기"
              }
            >
              {/* 사진 아이콘 영역 */}
              <span
                className="
                  flex h-12 w-12 shrink-0
                  items-center justify-center
                  rounded-2xl
                  bg-emerald-50
                  text-emerald-600
                  transition
                  group-hover:bg-emerald-100
                "
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-6 w-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* 사진 액자 */}
                  <rect
                    x="3"
                    y="4"
                    width="18"
                    height="16"
                    rx="3"
                  />

                  {/* 사진 속 작은 해 */}
                  <circle
                    cx="9"
                    cy="9"
                    r="1.5"
                  />

                  {/* 사진 속 산 모양 */}
                  <path d="M4.5 17 9.5 12l3.2 3.2 2.1-2.1 4.7 3.9" />

                  {/* 사진 추가 + 표시 */}
                  <path d="M17.5 5.5v4" />
                  <path d="M15.5 7.5h4" />
                </svg>
              </span>

              {/* 버튼 안쪽 안내 문구 */}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-700">
                  {isLimitReached
                    ? "사진과 영상을 모두 채웠어요"
                    : "사진, 영상 추가하기"}
                </span>

                <span className="mt-1 block text-xs font-medium leading-5 text-slate-400">
                  {isLimitReached
                    ? "다른 파일을 넣으려면 아래 첨부에서 하나를 삭제해 주세요."
                    : `눌러서 선택해 주세요. ${remainingCount}개 더 추가할 수 있어요.`}
                </span>
              </span>

              {/* 오른쪽 화살표 */}
              {!isLimitReached && (
                <span
                  className="
                    shrink-0 text-xl
                    text-slate-300
                    transition
                    group-hover:translate-x-0.5
                    group-hover:text-slate-400
                  "
                  aria-hidden="true"
                >
                  ›
                </span>
              )}
            </button>

      {/* 첨부 순서 변경 방법 안내 */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
        <p className="text-xs font-semibold leading-5 text-amber-800">
          순서가 다르면 카드를 끌거나
          앞으로, 뒤로 버튼으로 바꿀 수 있어요.
        </p>
      </div>

      {/* 10개를 모두 채웠을 때 보여주는 안내 */}
      {isLimitReached && (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
          첨부파일 {NOTE_ATTACHMENT_LIMIT}개를 모두
          채웠어요. 다른 파일을 넣으려면 기존 파일을
          하나 삭제해 주세요.
        </p>
      )}

      {/* 파일 업로드 진행 상태 */}
      {uploading && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-700">
            선택한 순서대로 파일을 올리고 있어요.
          </p>

          <p className="mt-1 truncate text-xs font-semibold text-emerald-600">
            {uploadProgress?.currentFileName ||
              "파일 준비 중"}{" "}
            · {uploadProgress?.completed || 0}/
            {uploadProgress?.total || 0}개 처리
          </p>
        </div>
      )}

      {/* 업로드 실패 또는 개수 초과 안내 */}
      {uploadError && (
        <p className="whitespace-pre-line rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
          {uploadError}
        </p>
      )}

      {/* 업로드된 첨부파일 카드 목록 */}
      {attachments.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500">
              업로드된 첨부 순서
            </p>

            <p className="text-xs text-slate-400">
              첫 번째 카드가 쪽지에서 가장 먼저 보여요.
            </p>
          </div>

          <DragDropProvider
            /*
             * 기존 기본 PointerSensor 대신
             * 우리가 위에서 만든 PointerSensor를 사용한다.
             *
             * 기본 KeyboardSensor는 그대로 남기기 위해
             * defaults에서 PointerSensor만 빼고 새 설정을 넣는다.
             */
            sensors={(defaults) => [
              ...defaults.filter(
                (sensor) =>
                  sensor !== PointerSensor
              ),
              NOTE_ATTACHMENT_POINTER_SENSOR,
            ]}

            // 손을 놓았을 때 실제 배열 순서를 바꾼다.
            onDragEnd={
              handleAttachmentDragEnd
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {attachments.map(
                (attachment, index) => (
                  <SortableAttachmentCard
                    key={
                      attachment.clientId ||
                      attachment.s3Key
                    }
                    attachment={attachment}
                    index={index}
                    attachmentCount={
                      attachments.length
                    }
                    palette={palette}
                    isDisabled={isDisabled}
                    onRemoveAttachment={
                      onRemoveAttachment
                    }
                    onMoveAttachment={
                      onMoveAttachment
                    }
                    onChangeAttachmentCaption={
                      onChangeAttachmentCaption
                    }
                  />
                )
              )}
            </div>
          </DragDropProvider>
        </div>
      )}
    </section>
  );
}