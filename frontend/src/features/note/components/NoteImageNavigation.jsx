/** 본인 쪽지와 공개 쪽지의 확대창에서 같은 좌우 버튼과 사진 순서를 표시한다. */
export default function NoteImageNavigation({ index, total, onMove }) {
  if (index === null || total < 1) return null;
  const buttonClass = "pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-black/70 text-3xl text-white shadow-lg hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-30";
  return <>
    <p role="status" aria-label="사진 순서" aria-live="polite" aria-atomic="true"
      className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm font-bold tabular-nums text-white">
      {index + 1} / {total}
    </p>
    <nav aria-label="확대 사진 이동" className="pointer-events-none absolute inset-x-2 top-1/2 z-20 flex -translate-y-1/2 justify-between sm:inset-x-6">
      <button type="button" aria-label="이전 사진" disabled={index <= 0} className={buttonClass}
        onClick={event => { event.stopPropagation(); onMove(-1); }}>‹</button>
      <button type="button" aria-label="다음 사진" disabled={index >= total - 1} className={buttonClass}
        onClick={event => { event.stopPropagation(); onMove(1); }}>›</button>
    </nav>
  </>;
}
