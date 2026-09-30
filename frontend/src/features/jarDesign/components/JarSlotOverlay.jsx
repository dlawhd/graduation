import { slotDimensions, slotStyle } from "../slotGeometry.mjs";

const APPEARANCE = {
  CAPSULE: { borderRadius: "999px", background: "#0f172a", border: "1px solid #ffffffb3" },
  RECTANGLE: { borderRadius: "2px", background: "#1e293b", border: "1px solid #cbd5e1" },
  OVAL: { borderRadius: "50%", background: "radial-gradient(ellipse at 50% 75%,#334155,#020617 80%)" },
  METAL: { borderRadius: "999px", background: "linear-gradient(#cbd5e1,#f8fafc 45%,#94a3b8)", padding: "5% 7%" },
  WOOD: { borderRadius: "15% / 35%", background: "repeating-linear-gradient(3deg,#bc8654 0 3px,#a57043 3px 5px)", padding: "5% 7%" },
  PIXEL: { background: "#1e1b4b", clipPath: "polygon(8% 0,92% 0,92% 18%,100% 18%,100% 82%,92% 82%,92% 100%,8% 100%,8% 82%,0 82%,0 18%,8% 18%)" },
};

/** 전체 경계 안에서만 장식해 모양을 바꾸어도 저장 좌표나 쪽지 투입 애니메이션이 어긋나지 않는다. */
export function SlotAppearance({ value }) {
  const kind = slotStyle(value);
  return <span className="relative block h-full w-full overflow-hidden shadow-inner" style={{ ...APPEARANCE[kind], padding: 0 }}>
    {["METAL", "WOOD"].includes(kind) && <span className="absolute rounded-full bg-slate-950 shadow-inner" style={{ inset: "23% 9%" }} />}
  </span>;
}

/** 편집 화면과 향후 Jar 화면이 같은 크기·위치 공식을 재사용하는 장식용 투입구다. */
export default function JarSlotOverlay({ slot }) {
  const { width, height } = slotDimensions(slot.sizeRatio);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute"
      style={{ left: `${slot.centerX * 100}%`, top: `${slot.centerY * 100}%`,
        width: `${width * 100}%`, height: `${height * 100}%`, transform: "translate(-50%, -50%)" }}><SlotAppearance value={slot.slotStyle} /></div>
  );
}
