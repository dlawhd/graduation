import React from "react";
import {createRoot} from "react-dom/client";
import "../src/index.css";
import PhotoFrameEditor from "../src/features/jarDesign/components/PhotoFrameEditor";
import {basicBodyOutline} from "../src/features/jarDesign/customJarBody.mjs";

// 로그인/저장 API 호출 없이 실제 사진 배치 UI와 키보드 조작을 확인한다. 저장 버튼은 누르지 않는다.
if(!import.meta.env.DEV)throw new Error("로컬 개발 전용 화면");
const image="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#fff8eb"/><circle cx="150" cy="310" r="85" fill="#9ccdbd"/><circle cx="340" cy="140" r="60" fill="#e5b2c4"/></svg>');
const draft={draftId:1,bodyStyle:"CUSTOM",customBody:basicBodyOutline("ROUND"),selectedDesignType:"ORIGINAL"};
createRoot(document.getElementById("root")).render(<main className="mx-auto max-w-6xl p-5"><PhotoFrameEditor draft={draft} previewUrl={image}/></main>);
