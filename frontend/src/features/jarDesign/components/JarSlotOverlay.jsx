import { slotDimensions, slotStyle } from "../slotGeometry.mjs";
import DecorativeSlotArtwork from "./DecorativeSlotArtwork";
import FreeformSlotArtwork from "./FreeformSlotArtwork";
import { getSlotAppearance } from "../slotCatalog.mjs";

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
  if (getSlotAppearance(kind).freeform) return <FreeformSlotArtwork value={kind}/>;
  if (!APPEARANCE[kind]) return <DecorativeSlotArtwork value={kind}/>;
  return <span className="relative block h-full w-full overflow-hidden shadow-inner" style={{ ...APPEARANCE[kind], padding: 0 }}>
    {["METAL", "WOOD"].includes(kind) && <span className="absolute rounded-full bg-slate-950 shadow-inner" style={{ inset: "23% 9%" }} />}
  </span>;
}

/** 선택 카드에서도 비율을 유지한다. 정사각 꽃을 가로 슬롯 칸에 찌그러뜨리지 않는다. */
export function SlotSwatch({ value, size = 64 }) {
  const aspect = getSlotAppearance(value).aspectRatio;
  return <span aria-hidden="true" className="flex shrink-0 items-center justify-center" style={{width:size,height:size}}>
    <span className="block" style={{width:size,height:size/aspect}}><SlotAppearance value={value}/></span>
  </span>;
}

/** 편집 화면과 향후 Jar 화면이 같은 크기·위치 공식을 재사용하는 장식용 투입구다. */
export default function JarSlotOverlay({ slot }) {
  const entry = getSlotAppearance(slot.slotStyle);
  const { width, height } = slotDimensions(slot.sizeRatio, entry.id);
  return (
    <div aria-hidden="true" data-jar-slot-target={entry.freeform ? undefined : ""} data-slot-style={entry.id} className="pointer-events-none absolute"
      style={{ left: `${slot.centerX * 100}%`, top: `${slot.centerY * 100}%`,
        width: `${width * 100}%`, height: `${height * 100}%`, transform: "translate(-50%, -50%)" }}>
      <SlotAppearance value={slot.slotStyle} />
      {/* 비대칭 모양도 외곽 중심이 아닌 실제 구멍 내부로 쪽지를 보낸다. 저장 좌표는 외곽 중심이다. */}
      {entry.freeform && <span data-jar-slot-target className="absolute" style={{left:`${entry.target.x*100}%`,top:`${entry.target.y*100}%`,
        width:`${entry.target.width*100}%`,height:`${entry.target.height*100}%`,transform:"translate(-50%, -50%)"}}/>}
    </div>
  );
}
