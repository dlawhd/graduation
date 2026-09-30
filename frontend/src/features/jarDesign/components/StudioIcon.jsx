/** 그림판 버튼에서 공통으로 쓰는 선 아이콘. 폰트 기호 대신 실제 도구 모양을 표시한다. */
export default function StudioIcon({ name, size = 24, ...props }) {
  const paths = {
    pen: "m4 20 4-1 12-12-5-5L3 14l1 6m9-16 5 5M3 21h7",
    eraser: "m3 13 9-10a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-8 9H9l-6-6a2 2 0 0 1 0-2m4-4 10 9M13 21h9",
    shapes: "M2 3h9v9H2zM16 3l6 9H10zM21 18a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
    fill: "m4 10 7-7 9 9-9 9-8-8 1-3m0 0h14M8 2l7 7m6 7s-4 4-2 6c3 2 5-1 2-6",
    eyedropper: "m14 3 7 7M16 2l6 6-4 4-6-6zM13 7 3 17v4h4L17 11",
    text: "M3 6V3h18v3M12 3v18M7 21h10",
    select: "M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6",
    undo: "M8 4 2 10l6 6M2 10h12a7 7 0 0 1 7 7",
    redo: "m16 4 6 6-6 6m6-6H10a7 7 0 0 0-7 7",
    download: "M12 2v13m-5-5 5 5 5-5M3 15v6h18v-6",
    rotate: "M3 9a9 9 0 1 1 1 9M3 3v6h6",
    flip: "M12 2v20M8 5 2 19h6V5m8 0 6 14h-6V5",
    grid: "M3 3h18v18H3zM9 3v18m6-18v18M3 9h18M3 15h18",
    trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
    close: "m5 5 14 14M19 5 5 19",
    zoom: "M16 16l6 6M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0M6 10h8m-4-4v8",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.pen} /></svg>;
}
