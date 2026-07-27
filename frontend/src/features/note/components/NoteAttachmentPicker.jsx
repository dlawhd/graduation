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
 * 파일 크기를 사람이 읽기 쉬운 형태로 변경하는 함수
 *
 * 예:
 * 1024 byte → 1.0 KB
 * 1048576 byte → 1.0 MB
 */
export function formatAttachmentSize(size) {
  const byteSize = Number(size);

  if (!Number.isFinite(byteSize) || byteSize < 0) {
    return "크기 정보 없음";
  }

  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
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
   * 드래그를 시작했을 때 실행된다.
   *
   * 몇 번째 첨부파일을 끌고 있는지
   * 브라우저의 dataTransfer에 임시 저장한다.
   */
  function handleDragStart(event, index) {
    if (isDisabled) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/plain",
      String(index)
    );
  }

  /*
   * 끌고 있던 파일을 다른 카드 위에 놓았을 때 실행된다.
   *
   * sourceIndex: 원래 위치
   * targetIndex: 이동할 위치
   */
  function handleDrop(event, targetIndex) {
    event.preventDefault();

    if (isDisabled) {
      return;
    }

    const sourceIndex = Number(
      event.dataTransfer.getData("text/plain")
    );

    if (
      !Number.isInteger(sourceIndex) ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    onMoveAttachment(sourceIndex, targetIndex);
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

          <p className="mt-1 text-xs text-slate-400">
            사진과 영상을 합쳐 최대{" "}
            {NOTE_ATTACHMENT_LIMIT}개까지 넣을 수 있어요.
          </p>
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

      {/* 사진·영상 선택창 */}
      <input
        type="file"
        multiple
        accept={NOTE_ATTACHMENT_ACCEPT}
        onChange={onSelectFiles}
        disabled={isDisabled || isLimitReached}
        className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${palette.input}`}
      />

      {/* 파일 선택 순서 안내 */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
        <p className="text-xs font-semibold leading-5 text-amber-800">
          파일 선택창이 전달한 순서대로 추가해요.
          순서가 다르면 카드를 끌거나
          ‘앞으로·뒤로’ 버튼으로 바꿀 수 있어요.
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
            {uploadProgress?.total || 0}개 완료
          </p>
        </div>
      )}

      {/* 업로드 실패 또는 개수 초과 안내 */}
      {uploadError && (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
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

          <div className="grid gap-3 sm:grid-cols-2">
            {attachments.map((attachment, index) => {
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
                  key={
                    attachment.clientId ||
                    attachment.s3Key ||
                    index
                  }
                  onDragOver={(event) =>
                    event.preventDefault()
                  }
                  onDrop={(event) =>
                    handleDrop(event, index)
                  }
                  className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  {/* 이미지 또는 영상 미리보기 */}
                  <div
                    draggable={!isDisabled}
                    onDragStart={(event) =>
                      handleDragStart(event, index)
                    }
                    className={`relative flex h-44 items-center justify-center bg-slate-50 ${
                      isDisabled
                        ? "cursor-default"
                        : "cursor-grab active:cursor-grabbing"
                    }`}
                    title="마우스로 끌어서 순서를 바꿀 수 있어요."
                  >
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-black text-white shadow-sm">
                      {index + 1}번째
                    </span>

                    {isImage ? (
                      <img
                        src={previewSource}
                        alt={`${index + 1}번째 첨부 ${displayName}`}
                        className="h-full w-full object-cover"
                      />
                    ) : isVideo ? (
                      <video
                        src={previewSource}
                        controls
                        className="h-full w-full bg-black object-cover"
                      />
                    ) : (
                      <div className="px-4 text-center text-xs font-semibold text-slate-500">
                        미리보기를 지원하지 않는
                        파일이에요.
                      </div>
                    )}
                  </div>

                  {/* 파일명, 크기, 순서 버튼, 삭제 버튼 */}
                  <div className="space-y-3 px-4 py-3">
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-bold text-slate-700"
                        title={displayName}
                      >
                        {displayName}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {attachment.contentType ||
                          "파일 형식 없음"}{" "}
                        ·{" "}
                        {formatAttachmentSize(
                          attachment.size
                        )}
                      </p>
                    </div>

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
                          isDisabled || index === 0
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
                            attachments.length - 1
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
            })}
          </div>
        </div>
      )}
    </section>
  );
}