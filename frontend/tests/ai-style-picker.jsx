import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import AiStylePicker from "../src/features/jarDesign/components/AiStylePicker";

// 실제 선택 컴포넌트를 API 호출이나 유료 AI 생성 없이 검증한다.
if (!import.meta.env.DEV) throw new Error("로컬 개발 전용 화면");
function Preview() {
  const [style, setStyle] = useState("CUTE_2D");
  const [disabled, setDisabled] = useState(false);
  return <main className="mx-auto max-w-6xl p-5">
    <h1 className="text-2xl font-black">원본을 어떤 분위기로 바꿔볼까요?</h1>
    <AiStylePicker value={style} onChange={setStyle} disabled={disabled} />
    <label className="mt-5 block"><input type="checkbox" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} /> 생성 중 선택 잠금</label>
    <output className="block">{style}</output>
  </main>;
}
const root = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<Preview />);
