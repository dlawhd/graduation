import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import JarOpenCelebrationModal from "../src/features/jarDetail/components/JarOpenCelebrationModal";
import { getThemePalette } from "../src/features/jarDetail/theme/jarDetailTheme";
import { basicBodyOutline } from "../src/features/jarDesign/customJarBody.mjs";

/** 실제 모달과 저장 디자인 렌더러를 합성 그림으로 검증한다. 서버 공개 상태는 시험 데이터로만 바꾼다. */
if (!import.meta.env.DEV) throw new Error("로컬 시험 전용");
const params = new URLSearchParams(location.search), mode = params.get("mode") || "prepared";
const design = mode === "theme" ? null : {
  imageUrl: mode === "missing" ? "/tests/opening-missing.svg" : mode === "hang" ? "/tests/opening-hang.svg" : mode === "opaque" ? "/tests/opening-opaque.svg" : "/tests/opening-photo.svg",
  bodyStyle: mode === "custom" || mode === "body-error" ? "CUSTOM" : ["image", "opaque", "protected"].includes(mode) ? null : mode === "panda" ? "RED_PANDA" : "CLOUD",
  imageTextureUrl: mode === "protected" ? "/api/v1/jars/7/design/texture?part=IMAGE" : null,
  customBody: basicBodyOutline("JAR", "#cfe6d5"),
  bodyArtworkUrl: mode === "body-error" ? "/tests/opening-body-missing.svg" : null,
  slotCenterX: .5, slotCenterY: .2, slotSizeRatio: .25, slotStyle: "HEART",
};
window.openingFixture = { closed: 0, viewed: 0, reloads: 0 };
function Fixture() {
  const [open, setOpen] = useState(false), [jar, setJar] = useState({ jarId: 7, name: "우리의 봄 저금통", theme: "SPRING", isOpen: mode !== "locked", design, openAt: "2026-11-06T10:00:00+09:00" });
  window.openingFixture.replace = () => setJar(value => ({ ...value, jarId: value.jarId + 1 }));
  window.openingFixture.lock = () => setJar(value => ({ ...value, isOpen: false }));
  return <main className="p-8"><h1>로컬 오픈 연출 시험</h1><button type="button" onClick={() => setOpen(true)}>오픈 연출 열기</button>
    <JarOpenCelebrationModal open={open} jar={jar} palette={getThemePalette(jar.theme)} event={{ jarId: mode === "mismatch" ? 99 : jar.jarId, openedAt: jar.openAt }}
      onClose={() => { window.openingFixture.closed++; setOpen(false); }}
      onViewNotes={() => { window.openingFixture.viewed++; setOpen(false); }}
      onReloadDesignImage={async () => { window.openingFixture.reloads++; setJar(value => ({ ...value, design: { ...value.design, imageUrl: "/tests/opening-photo.svg", bodyArtworkUrl: null } })); return true; }}/>
    <button type="button">배경 버튼</button>
  </main>;
}
createRoot(document.getElementById("root")).render(<Fixture/>);
