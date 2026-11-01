import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import CustomJarBodyViewer from "../src/features/jarDesign/components/CustomJarBodyViewer";
import { basicBodyOutline, customJarBody } from "../src/features/jarDesign/customJarBody.mjs";
import { coverPhotoFrame } from "../src/features/jarDesign/photoFraming.mjs";

// 합성 PNG와 로컬 대역 API만 사용한다. 운영 로그인·사진·저금통 데이터는 읽지 않는다.
if (!import.meta.env.DEV) throw new Error("로컬 회귀 검증 전용");
function Fixture() {
  const body = useMemo(() => ({ ...basicBodyOutline("ROUND"), artworkUrl: "/fixture-border.png" }), []);
  const [frame, setFrame] = useState(null);
  return <main style={{ width: 380, padding: 12 }}>
    <button onClick={() => setFrame(coverPhotoFrame(customJarBody(body).window, undefined, 2, 1, 0))}>사진 배치 변경</button>
    <CustomJarBodyViewer customBody={body} imageUrl="/fixture-photo.png" photoFrame={frame}
      imageTextureUrl="/api/v1/jars/1/design/texture?part=IMAGE"
      bodyArtworkTextureUrl="/api/v1/jars/1/design/texture?part=BODY"
      slot={{ centerX: .5, centerY: .42, sizeRatio: -.15, slotStyle: "METAL" }}>
      <p>2D 시험 화면</p>
    </CustomJarBodyViewer>
  </main>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
